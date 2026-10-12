/**
 * FREND — Resilient Background Reminder Worker
 *
 * Guarantees end-to-end reminder execution:
 * 1. Continuous execution independent of WhatsApp connection state.
 * 2. Atomic claim & lease locking to prevent duplicate notifications.
 * 3. Accurate Asia/Dhaka time handling & UTC persistence.
 * 4. Multi-channel delivery: WhatsApp -> Desktop Notification fallback -> Web Dashboard log.
 * 5. Startup recovery for server restarts, crashes, and overdue catch-up.
 * 6. Granular diagnostic auditing and timestamp tracking.
 */

'use strict';

const db = require('./database');
const offline = require('./offlineNotifier');
const analytics = require('./analytics');
const webDashboard = require('./webDashboard');
const authManager = require('./authManager');
const { formatTime, formatRelativeTime } = require('./timeParser');

let workerIntervalId = null;
let isWorkerRunning = false;
let isTickExecuting = false;

let _client = null;
let _sendBotReply = null;
let _getOwnerPhone = null;

/**
 * Configure worker dependencies
 */
function setWorkerContext({ client, sendBotReply, getOwnerPhone }) {
  if (client) _client = client;
  if (sendBotReply) _sendBotReply = sendBotReply;
  if (getOwnerPhone) _getOwnerPhone = getOwnerPhone;
}

/**
 * Deliver a single claimed reminder through the best available channel
 */
async function deliverReminderNotification(reminder) {
  const now = Date.now();
  const scheduledTime = new Date(reminder.remind_at).getTime();
  const delayMs = Math.max(0, now - scheduledTime);

  // Build user-friendly message
  let overdueNote = '';
  if (delayMs > 3 * 60 * 1000) {
    const mins = Math.round(delayMs / 60000);
    overdueNote = `\n\n⚠️ _(দেরিতে ডেলিভারি: সার্ভিস সংযোগ বা সিস্টেম রিস্টার্টের কারণে ${mins} মিনিট দেরিতে পাঠানো হলো)_`;
  }

  const notificationText =
    `⏰ *রিমাইন্ডার সম্পন্ন!*\n\n` +
    `📌 *${reminder.content}*\n\n` +
    `🕒 *নির্ধারিত সময়:* ${formatTime(new Date(reminder.remind_at))}\n` +
    `✅ _সময় পূর্ণ হওয়ায় কাজটি সম্পন্ন হিসেবে তালিকাভুক্ত করা হলো।_ 😊` +
    overdueNote;

  // Resolve actual WhatsApp destination JID for the user
  let targetJid = null;
  if (reminder.user_id) {
    const rawId = String(reminder.user_id).trim();
    // 1. Check authManager for registered user account (by ID, username, or phone/bound_phone match)
    const authUser = authManager.getUserById(rawId) ||
                     authManager.getUserByUsername(rawId) ||
                     authManager.getAuthenticatedUser(rawId);
    if (authUser && authUser.bound_phone) {
      targetJid = authUser.bound_phone;
    } else {
      const cleanDigits = rawId.replace(/\D/g, '');
      if (cleanDigits.startsWith('11') && cleanDigits.length >= 14 && cleanDigits.length <= 16) {
        targetJid = `${cleanDigits}@lid`;
      } else if (rawId.includes('@c.us') || rawId.includes('@lid') || rawId.includes('@s.whatsapp.net')) {
        targetJid = rawId;
      } else if (cleanDigits.length >= 10) {
        targetJid = `${cleanDigits}@c.us`;
      } else {
        targetJid = rawId;
      }
    }
  }

  // Fallback to bot owner phone or active connected WhatsApp phone
  if (!targetJid) {
    const botState = (webDashboard && typeof webDashboard.getBotState === 'function') ? webDashboard.getBotState() : {};
    const ownerPhone = (_getOwnerPhone && _getOwnerPhone()) || botState.userPhone || '8801969091751';
    const ownerDigits = String(ownerPhone).replace(/\D/g, '');
    if (ownerDigits.startsWith('11') && ownerDigits.length >= 14 && ownerDigits.length <= 16) {
      targetJid = `${ownerDigits}@lid`;
    } else {
      targetJid = `${ownerDigits}@c.us`;
    }
  }

  // Ensure proper format: WhatsApp LID numbers MUST use @lid
  const finalDigits = targetJid.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (finalDigits.startsWith('11') && finalDigits.length >= 14 && finalDigits.length <= 16) {
    targetJid = `${finalDigits}@lid`;
  } else if (!targetJid.includes('@')) {
    targetJid = `${finalDigits}@c.us`;
  }

  let deliveryChannel = null;
  let providerResponse = null;

  // 1. Attempt WhatsApp Delivery via _sendBotReply or WhatsApp client
  const isWhatsAppReady = Boolean(
    _sendBotReply ||
    (_client && typeof _client.sendMessage === 'function')
  );

  if (isWhatsAppReady) {
    try {
      if (_sendBotReply) {
        providerResponse = await _sendBotReply(targetJid, notificationText);
        if (providerResponse) {
          deliveryChannel = 'whatsapp';
          console.log(`[REMINDER WORKER] 📲 WhatsApp-এ রিমাইন্ডার #${reminder.id} সফলভাবে পাঠানো হয়েছে: ${targetJid}`);
        } else {
          console.warn(`[REMINDER WORKER] ⚠️ _sendBotReply-এ কোনো রেসপন্স আসেনি (টার্গেট: ${targetJid})`);
        }
      }
      if (!deliveryChannel && _client && typeof _client.sendMessage === 'function') {
        providerResponse = await _client.sendMessage(targetJid, notificationText);
        if (providerResponse) {
          deliveryChannel = 'whatsapp';
          console.log(`[REMINDER WORKER] 📲 WhatsApp-এ রিমাইন্ডার #${reminder.id} পাঠানো হয়েছে: ${targetJid}`);
        }
      }
    } catch (waErr) {
      console.warn(`[REMINDER WORKER] ⚠️ WhatsApp ডেলিভারি ব্যর্থ: ${waErr.message} — Desktop fallback ব্যবহার করা হচ্ছে।`);
    }
  }

  // 2. If WhatsApp failed or is offline, deliver via Desktop Notification
  if (!deliveryChannel) {
    try {
      offline.showDesktopNotification(
        'রিমাইন্ডার সম্পন্ন!',
        `${reminder.content} (${formatTime(new Date(reminder.remind_at))})`,
        reminder.user_id
      );
      deliveryChannel = 'desktop';
      providerResponse = { status: 'DESKTOP_NOTIFIED' };
    } catch (deskErr) {
      console.error(`[REMINDER WORKER] ❌ Desktop নোটিফিকেশন ব্যর্থ:`, deskErr.message);
    }
  }

  // 3. Always log to Web Dashboard Live Activity
  try {
    webDashboard.addLiveChatLog(
      'FREND (স্বয়ংক্রিয় রিমাইন্ডার)',
      `⏰ নির্ধারিত সময়: "${reminder.content}" [চ্যানেল: ${deliveryChannel || 'pending'}]`,
      notificationText
    );
  } catch (_) {}

  // 4. Analytics tracking
  try {
    analytics.trackReminderSent(
      targetJid,
      reminder.id,
      reminder.content,
      deliveryChannel === 'desktop'
    );
  } catch (_) {}

  return {
    deliveryChannel,
    providerResponse,
    delayMs,
  };
}

/**
 * Execute all due reminders in a single tick
 */
async function executeDueReminders() {
  if (isTickExecuting) return 0;
  isTickExecuting = true;

  let executedCount = 0;
  try {
    const dueReminders = db.getPendingReminders();
    if (!dueReminders || dueReminders.length === 0) {
      return 0;
    }

    for (const reminder of dueReminders) {
      // Step A: Atomic Claim with 60s lease to prevent concurrent execution
      const claimed = db.claimReminder(reminder.id, 60000);
      if (!claimed) {
        // Already claimed by another worker or tick
        continue;
      }

      const retryCount = (reminder.retry_count || 0) + 1;
      const jobStartedAt = new Date().toISOString();

      // Section 7: Enforce disabled account status in background worker
      let isOwnerDisabled = false;
      if (reminder.user_id) {
        const ownerUser = authManager.getAuthenticatedUser(reminder.user_id) || authManager.getUserById(reminder.user_id);
        if (ownerUser && (ownerUser.status === 'disabled' || ownerUser.status === 'blocked')) {
          isOwnerDisabled = true;
        }
      }

      if (isOwnerDisabled) {
        console.log(`[REMINDER WORKER] ⛔ Reminder #${reminder.id} suppressed: User account is disabled.`);
        db.updateReminderStatus(reminder.id, 'SUPPRESSED', 'User account is disabled');
        continue;
      }

      console.log(
        `\n[REMINDER WORKER] 🔔 Due Reminder Found: #${reminder.id} | Content: "${reminder.content}" | Scheduled: ${reminder.remind_at}`
      );

      // Record notification attempt
      db.recordReminderDeliveryAttempt(reminder.id, null, retryCount);

      try {
        const { deliveryChannel, providerResponse, delayMs } = await deliverReminderNotification(reminder);

        if (deliveryChannel) {
          // Success: Mark delivered with confirmed timestamp
          const confirmedAt = new Date().toISOString();
          db.markReminderDelivered(reminder.id, deliveryChannel, confirmedAt);
          executedCount++;

          // Comprehensive Diagnostic Log (Requirement 7)
          console.log(`[REMINDER WORKER] ✅ Delivered #${reminder.id}:`);
          console.log(`  • Reminder ID:              ${reminder.id}`);
          console.log(`  • Content:                  "${reminder.content}"`);
          console.log(`  • Requested Local Time:     ${formatTime(new Date(reminder.remind_at))}`);
          console.log(`  • Timezone:                 ${reminder.timezone || 'Asia/Dhaka'}`);
          console.log(`  • Resolved UTC (remind_at): ${reminder.remind_at}`);
          console.log(`  • Job Started At:           ${jobStartedAt}`);
          console.log(`  • Notification Confirmed:   ${confirmedAt}`);
          console.log(`  • Execution Delay:          ${delayMs}ms (~${(delayMs / 1000).toFixed(1)}s)`);
          console.log(`  • Delivery Channel:         ${deliveryChannel}`);
          console.log(`  • Retry Count:              ${retryCount}`);
          console.log(`  • Final Status:             DELIVERED\n`);
        } else {
          // Provider rejected/failed
          const errMsg = 'No notification channel was able to deliver message';
          db.recordReminderDeliveryAttempt(reminder.id, errMsg, retryCount);
          console.warn(`[REMINDER WORKER] ⚠️ Delivery attempt failed for #${reminder.id}: ${errMsg}`);
        }
      } catch (err) {
        db.recordReminderDeliveryAttempt(reminder.id, err.message, retryCount);
        console.error(`[REMINDER WORKER] ❌ Error executing reminder #${reminder.id}:`, err.message);
      }
    }
  } catch (outerErr) {
    console.error('[REMINDER WORKER] ❌ Error in worker tick:', outerErr.message);
  } finally {
    isTickExecuting = false;
  }

  return executedCount;
}

/**
 * Start the autonomous reminder background worker
 */
function startReminderWorker({ client = null, sendBotReply = null, getOwnerPhone = null, checkIntervalMs = 5000 } = {}) {
  setWorkerContext({ client, sendBotReply, getOwnerPhone });

  if (isWorkerRunning) {
    console.log('⏰ রিমাইন্ডার ব্যাকগ্রাউন্ড ওয়ার্কার ইতিমধ্যে সচল আছে।');
    return;
  }

  isWorkerRunning = true;

  // Startup Recovery: Reconcile crashed/interrupted jobs and catch up
  try {
    const recoveryResult = db.recoverPendingReminders();
    console.log(
      `🔄 [REMINDER WORKER] স্টার্টআপ রিকভারি সম্পন্ন — আটকে থাকা রিসেট: ${recoveryResult.stuckReset}, অতিরিক্ত বিলম্বিত: ${recoveryResult.overdueMarked}`
    );
  } catch (recErr) {
    console.warn('[REMINDER WORKER] ⚠️ স্টার্টআপ রিকভারিতে সতর্কতা:', recErr.message);
  }

  // Run initial check immediately
  setTimeout(() => {
    executeDueReminders().catch(() => {});
  }, 1000);

  // Continuous background interval (every 5 seconds)
  workerIntervalId = setInterval(async () => {
    try {
      await executeDueReminders();
    } catch (e) {
      console.error('[REMINDER WORKER] Uncaught tick error:', e.message);
    }
  }, checkIntervalMs);

  console.log(`⏰ [REMINDER WORKER] ব্যাকগ্রাউন্ড রিমাইন্ডার ওয়ার্কার চালু হয়েছে (চেক ইন্টারভাল: ${checkIntervalMs / 1000}s)।`);
}

/**
 * Stop the worker gracefully
 */
function stopReminderWorker() {
  if (workerIntervalId) {
    clearInterval(workerIntervalId);
    workerIntervalId = null;
  }
  isWorkerRunning = false;
  console.log('🛑 [REMINDER WORKER] রিমাইন্ডার ওয়ার্কার বন্ধ করা হয়েছে।');
}

/**
 * Worker state snapshot for diagnostics
 */
function getWorkerStatus() {
  return {
    isWorkerRunning,
    isTickExecuting,
    hasClient: Boolean(_client),
    hasSendReply: Boolean(_sendBotReply),
  };
}

module.exports = {
  startReminderWorker,
  stopReminderWorker,
  executeDueReminders,
  deliverReminderNotification,
  setWorkerContext,
  getWorkerStatus,
};
