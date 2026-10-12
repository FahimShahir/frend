/**
 * Offline Notification Module
 * WhatsApp সংযোগ না থাকলে Windows Desktop Notification দিয়ে রিমাইন্ডার।
 * সংযোগ ফিরলে মিস হওয়া নোটিফিকেশন WhatsApp-এ পাঠায়।
 */

'use strict';

const notifier = require('node-notifier');
const path = require('path');
const Database = require('better-sqlite3');
const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));

// ─── Offline Queue Table ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS offline_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent INTEGER DEFAULT 0
  );
`);

let _isOnline = true; // Track current connection state

function setOnline(val) {
  const wasOffline = !_isOnline;
  _isOnline = val;
  if (val) {
    console.log('🌐 অনলাইন — WhatsApp সংযুক্ত।');
  } else {
    console.log('📴 অফলাইন — Desktop নোটিফিকেশন চালু।');
  }
  return wasOffline && val; // returns true if we just came back online
}

function isOnline() { return _isOnline; }

/**
 * ডেস্কটপ নোটিফিকেশন দেখাও (অফলাইনে)
 */
function showDesktopNotification(title, message, userId = null) {
  notifier.notify({
    title: `🤖 ফ্রেন্ড — ${title}`,
    message: message.replace(/[*_~`]/g, ''), // strip WhatsApp markdown
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    sound: true,
    wait: false,
    appID: 'Frend Bot',
  });

  // Queue for later WhatsApp delivery if user_id given
  if (userId) {
    db.prepare(
      'INSERT INTO offline_queue (user_id, message) VALUES (?, ?)'
    ).run(userId, message);
  }

  console.log(`🔔 Desktop নোটিফিকেশন: ${title} — ${message.slice(0, 60)}`);
}

/**
 * সংযোগ ফিরলে queued messages পাঠাও
 */
async function flushOfflineQueue(sendFn) {
  const queued = db.prepare(
    'SELECT * FROM offline_queue WHERE sent = 0 ORDER BY created_at ASC'
  ).all();

  if (queued.length === 0) return 0;

  console.log(`📤 ${queued.length}টি অফলাইন মেসেজ পাঠানো হচ্ছে...`);

  let sent = 0;
  for (const item of queued) {
    try {
      const intro = `📴 *অফলাইনে মিস হয়েছিল:*\n\n`;
      await sendFn(item.user_id, intro + item.message);
      db.prepare('UPDATE offline_queue SET sent = 1 WHERE id = ?').run(item.id);
      sent++;
      await new Promise(r => setTimeout(r, 500)); // rate limit
    } catch (e) {
      console.error('❌ Offline queue পাঠাতে সমস্যা:', e.message);
    }
  }

  console.log(`✅ ${sent}টি অফলাইন মেসেজ পাঠানো হয়েছে।`);
  return sent;
}

/**
 * স্মার্ট রিমাইন্ডার ডেলিভারি — অনলাইন হলে WhatsApp, নইলে Desktop
 */
async function deliverReminder(reminder, sendWhatsAppFn, customMsg = null) {
  const msg = customMsg || (
    `⏰ *রিমাইন্ডার সম্পন্ন!*\n\n` +
    `📌 *${reminder.content}*\n\n` +
    `✅ _সময় পূর্ণ হওয়ায় কাজটি সম্পন্ন হিসেবে রিমাইন্ডার তালিকা থেকে মুছে ফেলা হলো।_ 😊`
  );

  if (_isOnline) {
    try {
      const res = await sendWhatsAppFn(reminder.user_id, msg);
      if (res) return 'whatsapp';
    } catch (e) {
      console.error('WhatsApp পাঠাতে সমস্যা, Desktop-এ দেখাচ্ছি:', e.message);
    }
  }

  // Offline fallback
  showDesktopNotification('রিমাইন্ডার সম্পন্ন!', `${reminder.content} (${reminder.remind_at || 'সময় হয়েছে'})`, reminder.user_id);
  return 'desktop';
}

/**
 * অফলাইন queue size
 */
function getPendingOfflineCount() {
  return db.prepare('SELECT COUNT(*) as c FROM offline_queue WHERE sent = 0').get().c;
}

module.exports = {
  setOnline, isOnline,
  showDesktopNotification, flushOfflineQueue,
  deliverReminder, getPendingOfflineCount,
};
