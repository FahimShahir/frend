/**
 * FREND — WhatsApp Memory Assistant v2
 * Features: Smart AI Reminders · Google Calendar · Voice Commands · Location Reminders
 *
 * Run: node index.js
 * Then scan the QR code with WhatsApp to connect.
 */

'use strict';

require('dotenv').config({ quiet: true });

const PORT = parseInt(process.env.PORT || '3000', 10);
console.log('🚀 [FREND BOT] Starting application process...');
console.log(`📡 [FREND BOT] Port: ${PORT}`);

// ─── Unhandled Error & Exit Handlers ─────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ [UNCAUGHT EXCEPTION]:', err?.stack || err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ [UNHANDLED REJECTION]:', reason?.stack || reason?.message || reason);
});

process.on('exit', (code) => {
  console.log(`🛑 [PROCESS EXIT] Code: ${code}`);
});

// ─── Phase 1: Start Web Dashboard & /health Probe IMMEDIATELY ───────────
console.log('📦 [PHASE 1] Initializing Web Dashboard & Health Server...');
const webDashboard = require('./src/webDashboard');
webDashboard.startWebDashboardServer(PORT);
console.log(`✅ [PHASE 1] Web Dashboard & /health probe active on 0.0.0.0:${PORT}`);

// ─── Phase 2: Loading core modules & database ───────────────────────────
console.log('📦 [PHASE 2] Loading core modules and database...');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const db = require('./src/database');
const { handleMessage } = require('./src/handler');
const { parseTime, formatTime, formatRelativeTime } = require('./src/timeParser');
const {
  transcribeVoice,
  analyzeImageForReminderOrNote,
  analyzeMeetingAudio,
  analyzeDocumentOrImage,
  saveMediaAttachment,
} = require('./src/aiAnalyzer');
const calendarSync = require('./src/calendarSync');
const locationDb = require('./src/locationReminder');
const offline = require('./src/offlineNotifier');
const analytics = require('./src/analytics');
const cloudBackup = require('./src/cloudBackup');
const authManager = require('./src/authManager');
const aiConfig = require('./src/aiConfig');
const reminderWorker = require('./src/reminderWorker');

// ─── Phase 3: Loading whatsapp-web.js ───────────────────────────────────
console.log('📦 [PHASE 3] Loading whatsapp-web.js...');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
console.log('📦 [PHASE 4] Dependencies loaded. Configuring WhatsApp Client...');

// ─── WhatsApp Client Setup ────────────────────────────────────
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './data/.wwebjs_auth' }),
  userAgent: DESKTOP_USER_AGENT,
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-blink-features=AutomationControlled',
      `--user-agent=${DESKTOP_USER_AGENT}`,
    ],
    timeout: 60000,
  },
  webVersion: '2.3000.1050029226-alpha',
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
    strict: false,
  },
});

// ─── Pairing Code Event (Phone Number Linking) ───────────────
client.on('code', async (code) => {
  console.log(`\n🔑 WhatsApp পেয়ারিং কোড: ${code}`);
  console.log('   (WhatsApp ➔ Linked Devices ➔ Link with phone number instead-এ গিয়ে কোডটি লিখুন)\n');
  webDashboard.updateBotState({ pairingCode: code });
});

// ─── QR Code ─────────────────────────────────────────────────
client.on('qr', async (qr) => {
  await webDashboard.setQrCode(qr);
  console.log('\n📱 WhatsApp QR কোড (ওয়েব ড্যাশবোর্ডেও দেখতে পাবেন: http://localhost:3000):\n');
  qrcode.generate(qr, { small: true });
  console.log('\n👆 উপরের QR কোড WhatsApp দিয়ে স্ক্যান করো।');
  console.log('   (বা ড্যাশবোর্ডে গিয়ে স্ক্যান করো: http://localhost:3000)\n');
});

// ─── Ready ────────────────────────────────────────────────────
client.on('ready', async () => {
  const now = new Date().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' });
  const myName = client.info?.pushname || '';
  const myPhone = client.info?.wid?.user || '';
  console.log(`\n✅ ফ্রেন্ড বট চালু হয়েছে! (${now})`);
  console.log(`📲 সংযুক্ত অ্যাকাউন্ট: ${myPhone} ${myName ? `(${myName})` : ''}`);
  console.log('📲 WhatsApp-এ নিজের সাথে চ্যাট (Message yourself)-এ মেসেজ পাঠাও।\n');

  if (myPhone) knownOwnerIds.add(String(myPhone).replace(/\D/g, ''));
  if (client.info?.wid?._serialized) knownOwnerIds.add(getCleanUser(client.info.wid._serialized));
  if (client.info?.lid?.user) knownOwnerIds.add(getCleanUser(client.info.lid.user));

  // Auto-bind connected WhatsApp identity to primary admin
  try {
    const admin = authManager.getAllUsers().find(u => u.role === 'admin') || authManager.getUserById(1);
    if (admin) {
      const activeJid = client.info?.wid?._serialized || (myPhone ? `${myPhone}@c.us` : null);
      if (activeJid) {
        authManager.bindUserPhone(admin.id, activeJid);
      }
    }
  } catch (_) {}

  webDashboard.updateBotState({
    status: 'CONNECTED',
    userName: myName,
    userPhone: myPhone,
    connectedAt: new Date().toISOString(),
    qrDataUrl: null,
  });

  const wasOffline = offline.setOnline(true);
  if (wasOffline) {
    const sent = await offline.flushOfflineQueue((userId, msg) =>
      sendBotReply(userId, msg)
    );
    if (sent > 0) console.log(`✅ ${sent}টি মিস হওয়া মেসেজ পাঠানো হয়েছে।`);
  }
  startReminderScheduler();
  reminderWorker.setWorkerContext({ client, sendBotReply, getOwnerPhone });
});

// ─── Owner Identities & Self-Chat Detection ──────────────────
function getCleanUser(jid) {
  if (!jid) return '';
  const raw = (typeof jid === 'object') ? (jid._serialized || jid.user || '') : String(jid);
  return String(raw).split('@')[0].split(':')[0].replace(/\D/g, '');
}

function normalizeChatJid(jid) {
  if (!jid) return '';
  const raw = (typeof jid === 'object') ? (jid._serialized || jid.user || '') : String(jid);
  const s = String(raw).trim();
  const cleanDevice = s.replace(/:[0-9]+(?=@)/, '');
  if (cleanDevice.endsWith('@g.us')) {
    return cleanDevice;
  }
  const cleanDigits = cleanDevice.split('@')[0].split(':')[0].replace(/\D/g, '');
  // WhatsApp LID numbers (typically 15 digits starting with 11) must use @lid
  if (cleanDigits.startsWith('11') && cleanDigits.length >= 14 && cleanDigits.length <= 16) {
    return `${cleanDigits}@lid`;
  }
  // Bangladeshi 11-digit mobile numbers starting with 01
  if (cleanDigits.startsWith('01') && cleanDigits.length === 11) {
    return `88${cleanDigits}@c.us`;
  }
  if (cleanDevice.endsWith('@lid') || cleanDevice.endsWith('@c.us')) {
    if (cleanDevice.endsWith('@c.us')) {
      const uDigits = cleanDevice.split('@')[0].replace(/\D/g, '');
      if (uDigits.startsWith('01') && uDigits.length === 11) {
        return `88${uDigits}@c.us`;
      }
    }
    return cleanDevice;
  }
  return cleanDigits ? `${cleanDigits}@c.us` : cleanDevice;
}

const knownOwnerIds = new Set(['117347113263149', '116660002377833', '118932660842648', '8801969091751', '01969091751', '1969091751']);

function getOwnerPhone() {
  const p = client.info?.wid?.user || webDashboard.getBotState().userPhone || process.env.OWNER_PHONE;
  return p ? String(p).replace(/\D/g, '') : '8801969091751';
}

function isMatchingOwner(id) {
  if (!id) return false;
  const clean = getCleanUser(id);
  if (!clean) return false;
  if (knownOwnerIds.has(clean)) return true;
  for (const known of knownOwnerIds) {
    if (clean === known) return true;
    if (clean.length >= 9 && known.length >= 9 && clean.slice(-9) === known.slice(-9)) {
      return true;
    }
  }
  return false;
}

// ─── Bot Reply Tracker (Watermarking & 5-Tier Loop Prevention) ───────
const BOT_SIGNATURE = '\u200B\u200C\u200D\uFEFF';
let lastBotSendTimestamp = 0;
const botSentMsgIds = new Set();
const botSentNormalized = new Set();
const processedMsgIds = new Set();
const recentMsgFingerprints = new Set();

function normalizeForDedupe(text) {
  if (!text) return '';
  return String(text).replace(/[\s\p{P}\p{S}\u200B-\u200D\uFEFF]/gu, '').toLowerCase();
}

const BOT_TEMPLATE_PREFIXES = [
  '⏰ *রিমাইন্ডার',
  '📝 *মনে রেখেছি',
  '🎉 *দারুণ! কাজ সম্পন্ন',
  '🎉 *কাজ সম্পন্ন',
  '📊 *',
  '🧠 *তোমার সম্পর্কে',
  '📸 *ছবি',
  '🔄 *মাল্টি-ডিভাইস',
  '✅ Google Calendar',
  '🔍 *',
  '_নোট নম্বর:',
  '_রিমাইন্ডার নম্বর:',
  '• সম্পন্ন কাজ:',
  '• সফলতার হার:',
  '🎤 [ভয়েস]:',
  '🎤 _শুনলাম:',
  '📍 *লোকেশন রিমাইন্ডার',
  '🌸 *আসসালামু আলাইকুম',
  '🕊️ *',
  '🤝 *',
  'আমি *FREND*',
  '✅ তোমার সম্মতিক্রমে',
  'আমি তোমার বক্তব্যটি নথিভুক্ত করেছি',
  '🔒 *যোগাযোগের অনুমতি',
  'বট গেটওয়ে',
];

function isBotMessage(msg) {
  if (!msg) return false;

  // 1. Invisible zero-width watermark anywhere in text
  if (msg.body && /[\u200B\u200C\u200D\uFEFF]/.test(msg.body)) {
    return true;
  }

  // 2. Message ID tracking
  const id = msg.id?._serialized || msg.id?.id;
  if (id && botSentMsgIds.has(id)) {
    return true;
  }

  // 3. Known bot template signature matching
  if (msg.body) {
    const raw = msg.body.trim();
    if (BOT_TEMPLATE_PREFIXES.some(p => raw.includes(p))) {
      return true;
    }
  }

  // 4. Normalized body content tracking
  if (msg.body) {
    const norm = normalizeForDedupe(msg.body);
    if (norm && botSentNormalized.has(norm)) {
      return true;
    }
  }

  // 5. Echo shield: if fromMe is true and arrived within 2.5s of bot sending
  if (msg.fromMe && (Date.now() - lastBotSendTimestamp < 2500)) {
    return true;
  }

  return false;
}

function isSelfChatMessage(msg) {
  if (!msg) return false;
  if (isBotMessage(msg)) return false;
  if (msg.from === 'status@broadcast') return false;
  if (msg.isGroupMsg || msg.from?.endsWith('@g.us') || msg.to?.endsWith('@g.us')) return false;

  const cleanFrom = getCleanUser(msg.from);
  const cleanTo = getCleanUser(msg.to);
  const ownerPhone = getOwnerPhone();

  if (ownerPhone) {
    knownOwnerIds.add(ownerPhone);
    if (ownerPhone.startsWith('880')) knownOwnerIds.add(ownerPhone.slice(2));
  }
  if (client.info?.wid?.user) knownOwnerIds.add(getCleanUser(client.info.wid.user));
  if (client.info?.lid?.user) knownOwnerIds.add(getCleanUser(client.info.lid.user));
  if (client.info?.wid?._serialized) knownOwnerIds.add(getCleanUser(client.info.wid._serialized));

  // 1. WhatsApp "Message yourself": From and To are identical
  if (cleanFrom && cleanTo && cleanFrom === cleanTo) {
    knownOwnerIds.add(cleanFrom);
    return true;
  }

  // 2. Sent by me (fromMe is true): Note-to-self / Message yourself
  if (msg.fromMe) {
    // If sent to self or one of my known IDs or note to self (empty destination)
    if (!cleanTo || isMatchingOwner(cleanTo) || (cleanFrom && cleanTo === cleanFrom)) {
      return true;
    }
    // Sent to an external friend/contact -> do NOT reply!
    return false;
  }

  // 3. Received message where sender is owner
  if (isMatchingOwner(cleanFrom)) {
    if (!cleanTo || isMatchingOwner(cleanTo) || cleanTo === cleanFrom) {
      return true;
    }
  }

  return false;
}

async function sendBotReply(targetOrMsg, text) {
  if (!text) return null;
  try {
    const rawText = text.trim();
    // Embed multi-character watermark at start and middle
    const replyPayload = rawText.includes(BOT_SIGNATURE)
      ? rawText
      : `${BOT_SIGNATURE}${rawText} ${BOT_SIGNATURE}`;

    lastBotSendTimestamp = Date.now();
    const norm = normalizeForDedupe(rawText);
    if (norm) {
      botSentNormalized.add(norm);
      setTimeout(() => botSentNormalized.delete(norm), 5 * 60 * 1000);
    }

    let sent = null;
    let replySuccess = false;

    // 1. Prefer msg.reply if available
    if (targetOrMsg && typeof targetOrMsg.reply === 'function') {
      try {
        sent = await targetOrMsg.reply(replyPayload);
        replySuccess = true;
      } catch (replyErr) {
        replySuccess = false; // genuinely failed, fall back below
      }
    }

    // 2. Only use client.sendMessage if msg.reply was NOT used or failed
    if (!replySuccess) {
      let targetJid = null;
      if (typeof targetOrMsg === 'string') {
        targetJid = targetOrMsg;
      } else if (targetOrMsg && typeof targetOrMsg === 'object') {
        if (typeof targetOrMsg._getChatId === 'function') {
          try { targetJid = targetOrMsg._getChatId(); } catch (_) {}
        }
        if (!targetJid && targetOrMsg.from) {
          targetJid = targetOrMsg.from;
        }
      }

      if (!targetJid) {
        targetJid = `${getOwnerPhone()}@c.us`;
      } else {
        targetJid = normalizeChatJid(targetJid);
      }

      try {
        sent = await client.sendMessage(targetJid, replyPayload);
      } catch (sendErr) {
        console.warn(`[sendBotReply] ⚠️ client.sendMessage failed for ${targetJid}:`, sendErr.message);
        // Fallback: try finding chat from active chats if LID or formatting mismatch
        try {
          if (client && typeof client.getChats === 'function') {
            const chats = await client.getChats();
            const targetDigits = getCleanUser(targetJid);
            const matchedChat = chats.find(c => {
              const cDigits = getCleanUser(c.id._serialized);
              return cDigits === targetDigits || (targetDigits.length >= 9 && cDigits.endsWith(targetDigits.slice(-9)));
            });
            if (matchedChat) {
              sent = await matchedChat.sendMessage(replyPayload);
            }
          }
        } catch (chatLookupErr) {
          console.warn(`[sendBotReply] Chat lookup fallback error:`, chatLookupErr.message);
        }
      }
    }

    if (sent && sent.id) {
      const id = sent.id._serialized || sent.id.id;
      if (id) {
        botSentMsgIds.add(id);
        setTimeout(() => botSentMsgIds.delete(id), 5 * 60 * 1000);
      }
    }
    return sent;
  } catch (err) {
    const target = (typeof targetOrMsg === 'string') ? targetOrMsg : targetOrMsg?.from;
    console.error(`❌ রিপ্লাই পাঠাতে সমস্যা [${target}]:`, err.message);
    return null;
  }
}

// ─── Laravel Webhook Forwarders (Friendship Mediation & Peacemaking) ──
async function forwardToLaravelWebhook(payload) {
  try {
    const laravelUrl = process.env.APP_URL || process.env.LARAVEL_APP_URL || 'http://127.0.0.1:8000';
    const http = require('http');
    const postData = JSON.stringify(payload);
    const u = new URL(`${laravelUrl}/api/whatsapp/webhook`);

    return new Promise((resolve) => {
      const req = http.request({
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 6000,
      }, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(respData));
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(postData);
      req.end();
    });
  } catch (_) {
    return null;
  }
}

async function forwardToLaravelGroupLeave(groupId, leaverPhone) {
  try {
    const laravelUrl = process.env.APP_URL || process.env.LARAVEL_APP_URL || 'http://127.0.0.1:8000';
    const http = require('http');
    const postData = JSON.stringify({
      group_id: groupId,
      leaver_phone: leaverPhone,
    });
    const u = new URL(`${laravelUrl}/api/whatsapp/group-leave`);

    return new Promise((resolve) => {
      const req = http.request({
        hostname: u.hostname,
        port: u.port || 80,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 6000,
      }, (res) => {
        let respData = '';
        res.on('data', chunk => { respData += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(respData));
          } catch (_) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(postData);
      req.end();
    });
  } catch (_) {
    return null;
  }
}

// ─── Unified Message Processor ────────────────────────────────
async function handleIncomingMsg(msg) {
  try {
    if (!msg || msg.from === 'status@broadcast') return;

    // 0. Group Message Handling for Friendship Mediation
    const isGroup = msg.isGroupMsg || msg.from?.endsWith('@g.us') || msg.to?.endsWith('@g.us');
    if (isGroup) {
      if (isBotMessage(msg)) return;
      const groupId = msg.from?.endsWith('@g.us') ? msg.from : (msg.to?.endsWith('@g.us') ? msg.to : null);
      const participant = msg.author || msg.from;
      if (groupId && msg.body && participant) {
        forwardToLaravelWebhook({
          sender: participant,
          group_id: groupId,
          message: msg.body,
          name: msg._data?.notifyName || 'গ্রুপ সদস্য'
        });
      }
      return;
    }

    // 1. Watermark & Bot Own Message Filter (100% Loop Prevention)
    if (isBotMessage(msg)) {
      return;
    }

    // 2. Deduplicate event triggers by Message / Stanza ID
    const msgId = msg.id?._serialized || msg.id?.id;
    const stanzaId = msg.id?.id;
    if (msgId) {
      if (processedMsgIds.has(msgId) || (stanzaId && processedMsgIds.has(stanzaId))) {
        return;
      }
      processedMsgIds.add(msgId);
      if (stanzaId) processedMsgIds.add(stanzaId);
      setTimeout(() => {
        processedMsgIds.delete(msgId);
        if (stanzaId) processedMsgIds.delete(stanzaId);
      }, 5 * 60 * 1000);
    }

    // 3. Ignore messages sent by me to other external people (prevent replying to third-party chats)
    if (msg.fromMe && !isSelfChatMessage(msg)) {
      return;
    }

    // 4. Normalized Sender JID
    const senderJid = msg.fromMe ? (msg.to || msg.from) : msg.from;
    const cleanSenderDigits = authManager.cleanDigits(senderJid);

    // 5. Debounce identical messages from same sender within 4s (handles multi-device duplicate events)
    const normBody = normalizeForDedupe(msg.body);
    const fingerprint = `${cleanSenderDigits || msg.from}_${normBody}`;
    if (recentMsgFingerprints.has(fingerprint)) {
      return;
    }
    recentMsgFingerprints.add(fingerprint);
    setTimeout(() => recentMsgFingerprints.delete(fingerprint), 4000);

    // 6. Authentication & Access Control Gate
    let authUser = authManager.getAuthenticatedUser(senderJid);

    // Auto-authenticate owner / self-chat as Admin user
    if (!authUser && (isMatchingOwner(senderJid) || isSelfChatMessage(msg))) {
      const admin = authManager.getAllUsers().find(u => u.role === 'admin') || authManager.getUserById(1);
      if (admin) {
        authUser = admin;
        try {
          authManager.bindUserPhone(admin.id, senderJid);
        } catch (_) {}
      }
    }

    if (!authUser) {
      console.log(`🔒 [AUTH GATE] অননুমোদিত মেসেজ [${senderJid}]: "${msg.body || ''}"`);
      const rawText = (msg.body || '').trim();
      const loginRes = authManager.attemptLogin(senderJid, rawText);

      if (loginRes.isAttempt && loginRes.success) {
        const welcomeText = `🎉 *স্বাগতম, ${loginRes.user.display_name || loginRes.user.username}!*\n\n` +
          `আপনার WhatsApp নম্বরটি সফলভাবে ভেরিফাই ও সংযুক্ত হয়েছে।\n` +
          `এখন থেকে আপনি FREND বটকে যেকোনো নোট, রিমাইন্ডার বা প্রশ্ন পাঠাতে পারবেন।\n` +
          `পরবর্তীতে আর কখনো পাসওয়ার্ড দিতে হবে না।`;
        await sendBotReply(msg, welcomeText);
        webDashboard.addLiveChatLog(loginRes.user.display_name || loginRes.user.username, rawText, 'লগইন সফল');
        return;
      }

      if (loginRes.isAttempt && !loginRes.success) {
        const failText = `❌ *লগইন ব্যর্থ হয়েছে!*\n` +
          `কারণ: ${loginRes.reason || 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।'}\n\n` +
          `অনুগ্রহ করে সঠিক ফরম্যাটে লিখুন: \`<ইউজারনেম> <পাসওয়ার্ড>\`\n` +
          `উদাহরণ: \`admin 123\`\n` +
          `_(অ্যাকাউন্ট না থাকলে ড্যাশবোর্ড অ্যাডমিনের সাথে যোগাযোগ করুন)_`;
        await sendBotReply(msg, failText);
        return;
      }

      // Check if this message is part of an ongoing Friendship Mediation in Laravel (Party B outreach / response)!
      const laravelMediationRes = await forwardToLaravelWebhook({
        sender: normalizeChatJid(senderJid),
        message: rawText,
        name: client.info?.pushname || 'বন্ধু',
        check_only: 'mediation'
      });
      if (laravelMediationRes && laravelMediationRes.status === 'handled' && laravelMediationRes.type === 'friendship_mediation') {
        console.log(`🤝 [MEDIATION] Party B মেসেজ Laravel ফ্রেন্ডশিপ মিডিয়েশন দ্বারা প্রসেস হয়েছে [${laravelMediationRes.step || ''}]`);
        if (laravelMediationRes.reply) {
          await sendBotReply(msg, laravelMediationRes.reply);
        }
        return;
      }

      // Not an attempt: send prompt if not recently prompted
      if (authManager.shouldSendAuthPrompt(senderJid)) {
        const promptText = `🔒 *FREND সিকিউরিটি ভেরিফিকেশন*\n\n` +
          `এই বটটি ব্যবহারের জন্য অনুগ্রহ করে আপনার ইউজারনেম ও পাসওয়ার্ড পাঠান।\n\n` +
          `📝 *ফরম্যাট:* \`<ইউজারনেম> <পাসওয়ার্ড>\`\n` +
          `উদাহরণ: \`admin 123\`\n\n` +
          `_(সঠিক তথ্য দিলে স্বয়ংক্রিয়ভাবে আপনার আইডি যুক্ত হবে এবং পরবর্তীতে আর পাসওয়ার্ড লাগবে না)_`;
        await sendBotReply(msg, promptText);
      }
      return; // Unauthorized users receive NO further bot replies!
    }

    // 6. Authenticated User Handling
    const rawText = (msg.body || '').trim();
    if (/^(logout|লগআউট)$/i.test(rawText)) {
      authManager.unbindUserPhone(authUser.id);
      await sendBotReply(msg, `👋 *লগআউট সম্পন্ন হয়েছে!*\n${authUser.display_name || authUser.username}, আপনার WhatsApp নম্বরটি ডিসকানেক্ট করা হয়েছে। পুনরায় ব্যবহারের জন্য আবার ইউজারনেম ও পাসওয়ার্ড দিয়ে লগইন করুন।`);
      return;
    }

    // ── Section 3: WhatsApp Secure Credential Change Flow ──
    if (/(?:change\s*password|পাসওয়ার্ড\s*পরিবর্তন|পাসওয়ার্ড\s*বদলা|change\s*username|ইউজারনেম\s*পরিবর্তন|security|credential|সিকিউরিটি|পাসওয়ার্ড\s*চেঞ্জ)/i.test(rawText)) {
      try {
        const token = authManager.createCredentialChangeToken(authUser.id, 'credentials_change');
        const ip = webDashboard.getLocalIpAddress();
        const securityUrl = `http://${ip}:3000/account/security?token=${token}`;
        await sendBotReply(
          msg,
          `🔒 *FREND সিকিউরিটি অ্যাকাউন্ট পোর্টাল*\n\n` +
          `আপনার ইউজারনেম বা পাসওয়ার্ড নিরাপদে পরিবর্তনের জন্য নিচের সুরক্ষিত পোর্টালে যান:\n` +
          `👉 *${securityUrl}*\n\n` +
          `🛡️ _নিরাপত্তা নির্দেশিকা:_\n` +
          `• বর্তমান ইউজারনেম ও বর্তমান পাসওয়ার্ড দিয়ে নিশ্চিত করতে হবে।\n` +
          `• এই লিঙ্কটি একক ব্যবহারের জন্য এবং ১০ মিনিট পর্যন্ত কার্যকর।\n` +
          `• WhatsApp-এ সরাসরি পাসওয়ার্ড লিখবেন না।`
        );
      } catch (secErr) {
        await sendBotReply(msg, `❌ সমস্যা: ${secErr.message}`);
      }
      return;
    }

    // Protect against plaintext password transmission in chat
    if (/(?:my\s*password\s*is|আমার\s*পাসওয়ার্ড\s*হলো|new\s*password[:\s]+)/i.test(rawText)) {
      try {
        const token = authManager.createCredentialChangeToken(authUser.id, 'credentials_change');
        const ip = webDashboard.getLocalIpAddress();
        await sendBotReply(
          msg,
          `⚠️ *সতর্কতা: চ্যাটে পাসওয়ার্ড লিখবেন না!*\n\n` +
          `আপনার নিরাপত্তা রক্ষার্থে চ্যাটে প্রেরিত তথ্য সংরক্ষণ করা হয়নি।\n` +
          `পাসওয়ার্ড পরিবর্তন করতে নিচের সুরক্ষিত পোর্টাল ব্যবহার করুন:\n` +
          `👉 *http://${ip}:3000/account/security?token=${token}*`
        );
      } catch (_) {}
      return;
    }

    // ── Section 4: Individual Google Calendar Connection ──
    if (/(?:connect\s*google\s*calendar|ক্যালেন্ডার\s*কানেক্ট|ক্যালেন্ডার\s*যুক্ত|link\s*calendar)/i.test(rawText)) {
      const ip = webDashboard.getLocalIpAddress();
      const redirectUri = `http://${ip}:3000/oauth2/google/callback`;
      try {
        const { authUrl } = calendarSync.generateUserAuthUrl(authUser.id, redirectUri);
        await sendBotReply(
          msg,
          `📅 *Google Calendar সংযোগ লিঙ্ক*\n\n` +
          `আপনার ব্যক্তিগত Google Calendar ফ্রেন্ড বটের সাথে যুক্ত করতে নিচের লিঙ্কে ক্লিক করুন:\n` +
          `👉 *${authUrl}*\n\n` +
          `_অনুমতি দিলে আপনার রিমাইন্ডারগুলো স্বয়ংক্রিয়ভাবে Google Calendar-এ সিঙ্ক হয়ে যাবে!_`
        );
      } catch (calErr) {
        await sendBotReply(msg, `❌ Google Calendar লিংক তৈরিতে সমস্যা: ${calErr.message}`);
      }
      return;
    }

    const ownerUserId = normalizeChatJid(senderJid) || authUser.bound_phone;
    const ownerName = authUser.display_name || authUser.username || client.info?.pushname || 'User';

    // ── Voice Message ──
    if (msg.hasMedia && (msg.type === 'ptt' || msg.type === 'audio')) {
      const access = authManager.canUserAccessFeature(authUser.id, 'voice');
      if (!access.allowed) {
        await sendBotReply(msg, `🎙️ *ফিচারটি অন্তর্ভুক্ত নেই!*\n\n${access.reason}`);
        return;
      }
      await handleVoiceMessage(msg, ownerUserId, ownerName);
      return;
    }

    // ── Image Message (Vision AI for Reminders & Notes) ──
    if (msg.hasMedia && (msg.type === 'image' || msg.mimetype?.startsWith('image/'))) {
      const access = authManager.canUserAccessFeature(authUser.id, 'vision');
      if (!access.allowed) {
        await sendBotReply(msg, `📸 *ফিচারটি অন্তর্ভুক্ত নেই!*\n\n${access.reason}`);
        return;
      }
      await handleImageMessage(msg, ownerUserId, ownerName);
      return;
    }

    // ── Document & File Attachment Message (Section 7) ──
    if (msg.hasMedia && (msg.type === 'document' || !['ptt', 'audio', 'image', 'location'].includes(msg.type))) {
      await handleDocumentMessage(msg, ownerUserId, ownerName);
      return;
    }

    // ── Location Message ──
    if (msg.type === 'location') {
      await handleLocationMessage(msg, ownerUserId, ownerName);
      return;
    }

    // ── Text Message ──
    if (msg.body && msg.body.trim()) {
      console.log(`📩 মেসেজ গ্রহণ [${ownerName}]: "${msg.body}"`);

      // Check Friendship Mediation / Conflict Resolution in Laravel first
      const laravelMediationRes = await forwardToLaravelWebhook({
        sender: normalizeChatJid(senderJid),
        message: msg.body,
        name: ownerName,
        check_only: 'mediation'
      });
      if (laravelMediationRes && laravelMediationRes.status === 'handled' && (laravelMediationRes.type === 'friendship_mediation' || laravelMediationRes.type === 'outgoing_message')) {
        console.log(`🤝 [MEDIATION] Laravel ফ্রেন্ডশিপ মিডিয়েশন সক্রিয় [ধাপ: ${laravelMediationRes.step || 'N/A'}]`);
        if (laravelMediationRes.reply) {
          await sendBotReply(msg, laravelMediationRes.reply);
        }
        return;
      }

      const response = await handleMessage(ownerUserId, ownerName, msg.body);
      if (response) {
        console.log(`🤖 রিপ্লাই তৈরি: "${response.slice(0, 30).replace(/\n/g, ' ')}..."`);
        const sent = await sendBotReply(msg, response);
        if (sent) {
          console.log(`✅ রিপ্লাই সফলভাবে পাঠানো হয়েছে!`);
        }
        // Live Chat Logger for Web Dashboard
        webDashboard.addLiveChatLog(ownerName, msg.body, response);
      }
    }
  } catch (err) {
    console.error('❌ মেসেজ প্রসেস করতে সমস্যা:', err.message);
  }
}

// ─── Event Registration: Dual listeners with built-in deduplication ──
client.on('message', (msg) => {
  handleIncomingMsg(msg);
});

client.on('message_create', (msg) => {
  handleIncomingMsg(msg);
});

// ─── Group Leave Event Listener (Mediation Step 7 & Step 9) ──
client.on('group_leave', async (notification) => {
  try {
    const groupId = notification.chatId || notification.id?.remote;
    const leaverPhone = notification.author || notification.recipientIds?.[0] || notification.id?.participant;
    console.log(`🚪 [GROUP LEAVE] গ্রুপ ত্যাগ করেছেন: ${leaverPhone} (গ্রুপ: ${groupId})`);
    if (groupId && leaverPhone) {
      await forwardToLaravelGroupLeave(groupId, leaverPhone);
    }
  } catch (err) {
    console.error('❌ গ্রুপ লিভ ইভেন্ট প্রসেস করতে সমস্যা:', err.message);
  }
});

// ─── Voice & Meeting Audio Handler (Section 6) ────────────────
async function handleVoiceMessage(msg, userId, userName) {
  if (!process.env.GEMINI_API_KEY) {
    await sendBotReply(
      msg,
      `🎤 *ভয়েস মেসেজ পেয়েছি!*\n\n` +
      `ভয়েস ট্রান্সক্রিপশন ও মিটিং বিশ্লেষণের জন্য GEMINI_API_KEY দরকার।\n` +
      `_.env ফাইলে GEMINI_API_KEY যোগ করো।_`
    );
    return;
  }

  await sendBotReply(msg, '🎤 _ভয়েস বা মিটিং রেকর্ডিং শুনছি ও বিশ্লেষণ করছি..._');

  try {
    const media = await msg.downloadMedia();
    if (!media || !media.data) {
      await sendBotReply(msg, '❌ ভয়েস অডিও ফাইল ডাউনলোড করতে পারলাম না।');
      return;
    }

    const audioBuffer = Buffer.from(media.data, 'base64');
    const mimeType = media.mimetype || 'audio/ogg; codecs=opus';

    // 1. Persistent file attachment reference
    const savedAudio = saveMediaAttachment(audioBuffer, 'ogg', 'voice');

    // 2. Intelligent audio & meeting reasoning
    const meetingResult = await analyzeMeetingAudio(audioBuffer, mimeType, msg.body || '');
    const transcript = meetingResult.transcript;

    if (!transcript) {
      await sendBotReply(msg, '❌ অডিও থেকে কোনো কথা শনাক্ত করা যায়নি।');
      return;
    }

    console.log(`🎤 অডিও ট্রান্সক্রিপশন [${userName || userId}]: ${transcript.slice(0, 50)}...`);

    // ৩. মিটিং বা আলোচনা শনাক্ত হলে
    if (meetingResult.isMeeting || (meetingResult.decisions && meetingResult.decisions.length > 0) || (meetingResult.topics && meetingResult.topics.length > 0)) {
      const memId = db.saveMemory(userId, {
        memoryType: 'meeting',
        sourceType: 'voice',
        originalRef: savedAudio.relativePath,
        title: meetingResult.title || 'মিটিং রেকর্ডিং',
        content: transcript,
        structuredData: meetingResult,
        topics: (meetingResult.topics || []).join(', '),
      });

      let meetingReply = `🎙️ *মিটিং রেকর্ডিং মেমরিতে সংরক্ষিত হয়েছে! (#M${memId})*\n\n`;
      meetingReply += `📌 *${meetingResult.title || 'মিটিং আলোচনা'}*\n\n`;
      if (meetingResult.decisions && meetingResult.decisions.length > 0) {
        meetingReply += `✅ *গৃহীত সিদ্ধান্তসমূহ:* \n`;
        meetingResult.decisions.forEach(d => { meetingReply += `• ${d}\n`; });
        meetingReply += `\n`;
      }
      if (meetingResult.actionItems && meetingResult.actionItems.length > 0) {
        meetingReply += `📌 *অ্যাকশন আইটেম ও ডেডলাইন:* \n`;
        meetingResult.actionItems.forEach(a => {
          meetingReply += `• ${a.task}${a.deadline ? ` (ডেডলাইন: ${a.deadline})` : ''}\n`;
        });
        meetingReply += `\n`;
      }
      meetingReply += `📁 _মূল অডিও ফাইল সংরক্ষিত আছে: ${savedAudio.relativePath}_\n`;
      meetingReply += `_পরবর্তীতে যেকোনো সময় জানতে পারো: "আগের মিটিংয়ে কী সিদ্ধান্ত হয়েছিল?"_`;

      await sendBotReply(msg, meetingReply);
      webDashboard.addLiveChatLog(userName || 'Owner', `🎤 [মিটিং]: "${meetingResult.title}"`, meetingReply);
      return;
    }

    // ৪. সাধারণ ভয়েস নির্দেশ বা কথা
    db.saveMemory(userId, {
      memoryType: 'voice',
      sourceType: 'voice',
      originalRef: savedAudio.relativePath,
      title: 'ভয়েস অডিও',
      content: transcript,
      structuredData: meetingResult,
    });

    await sendBotReply(msg, `🎤 _শুনলাম: "${transcript}"_`);
    const response = await handleMessage(userId, userName, transcript);
    if (response) {
      await sendBotReply(msg, response);
      webDashboard.addLiveChatLog(userName || 'Owner', `🎤 [ভয়েস]: "${transcript}"`, response);
    }

  } catch (err) {
    console.error('❌ ভয়েস প্রসেস সমস্যা:', err.message);
    await sendBotReply(msg, '❌ ভয়েস অডিও প্রসেস করতে সমস্যা হয়েছে।');
  }
}

// ─── Image Message Handler (Vision AI & Persistent Memory - Section 7) ──
async function handleImageMessage(msg, userId, userName) {
  if (!process.env.GEMINI_API_KEY) {
    await sendBotReply(
      msg,
      `📸 *ছবি পেয়েছি!*\n\nছবি দেখে রিমাইন্ডার ও তথ্য বোঝার জন্য GEMINI_API_KEY প্রয়োজন।\n_.env ফাইলে GEMINI_API_KEY যোগ করো।_`
    );
    return;
  }

  await sendBotReply(msg, '📸 _ছবিটি দেখছি ও বিশ্লেষণ করছি..._');

  try {
    const media = await msg.downloadMedia();
    if (!media || !media.data) {
      await sendBotReply(msg, '❌ ছবিটি ডাউনলোড করতে পারলাম না।');
      return;
    }

    const imageBuffer = Buffer.from(media.data, 'base64');
    const mimeType = media.mimetype || 'image/jpeg';
    const caption = (msg.body || msg.caption || '').trim();

    // 1. Persistent file attachment reference
    const savedImg = saveMediaAttachment(imageBuffer, mimeType.includes('png') ? 'png' : 'jpg', 'image');

    // 2. Vision Analysis via Gemini
    const result = await analyzeImageForReminderOrNote(imageBuffer, mimeType, caption);
    const docResult = await analyzeDocumentOrImage(imageBuffer, mimeType, caption);

    // 3. Persistent Memory Record
    const memTitle = (docResult && docResult.title) || (result && result.title) || 'সংরক্ষিত ছবি';
    const memContent = (docResult && docResult.extractedText) || (result && (result.content || result.description)) || caption || 'ছবি';

    const memId = db.saveMemory(userId, {
      memoryType: 'image',
      sourceType: 'image',
      originalRef: savedImg.relativePath,
      title: memTitle,
      content: memContent,
      structuredData: { ...result, ...docResult },
      topics: (docResult && docResult.documentType) || 'image',
    });

    if (!result && !docResult) {
      await sendBotReply(msg, `📸 ছবিটি দেখা ও সংরক্ষণ করা হয়েছে (#M${memId})।\n📁 _রেফারেন্স: ${savedImg.relativePath}_`);
      return;
    }

    // ১. রিমাইন্ডার শনাক্ত হলে
    if (result && result.type === 'REMINDER') {
      const title = result.title || 'ছবি সম্পর্কিত কাজ';
      let remindAt = parseTime(caption) || (result.timeHint ? parseTime(result.timeHint) : null);
      if (!remindAt) {
        remindAt = new Date(Date.now() + 60 * 60 * 1000);
      }
      const reminderId = db.saveReminder(userId, title, remindAt);
      if (calendarSync.isConfigured()) {
        calendarSync.addToGoogleCalendar(title, remindAt).catch(() => {});
      }
      analytics.trackEvent(userId, 'photo_reminder_created', title);

      let reply = `📸 *ছবি থেকে রিমাইন্ডার সেট করা হলো!*\n\n`;
      reply += `📌 *${title}*\n`;
      if (result.details) {
        reply += `📝 _বিবরণ:_ ${result.details}\n`;
      }
      reply += `🕒 *সময়:* ${formatTime(remindAt)} (${formatRelativeTime(remindAt)})\n\n`;
      reply += `📁 _মূল ছবি সংরক্ষিত: ${savedImg.relativePath}_\n`;
      reply += `_রিমাইন্ডার নম্বর: #${reminderId}_`;

      await sendBotReply(msg, reply);
      webDashboard.addLiveChatLog(userName || 'Owner', `📸 [ছবি]: "${caption || 'রিমাইন্ডার ছবি'}"`, reply);
      return;
    }

    // ২. নোট বা তথ্য শনাক্ত হলে
    if (result && result.type === 'NOTE') {
      const noteTitle = result.title || (docResult && docResult.title) || 'ছবি থেকে প্রাপ্ত তথ্য';
      const fullContent = `${noteTitle}\n${result.content || (docResult && docResult.summary) || ''}`.trim();
      const noteId = db.saveNote(userId, fullContent, 'photo');
      analytics.trackEvent(userId, 'photo_note_created', noteTitle);

      let reply = `📸 *ছবি থেকে তথ্য মনে রাখা হলো!*\n\n`;
      reply += `📌 *${noteTitle}*\n`;
      if (result.content || (docResult && docResult.summary)) {
        reply += `📝 ${result.content || docResult.summary}\n\n`;
      }
      reply += `📁 _মূল ছবি সংরক্ষিত: ${savedImg.relativePath}_\n`;
      reply += `_নোট নম্বর: #${noteId} (মেমরি: #M${memId})_\n`;
      reply += `_পরবর্তীতে জানতে পারো: "ওই ছবিতে কী লেখা ছিল?"_`;

      await sendBotReply(msg, reply);
      webDashboard.addLiveChatLog(userName || 'Owner', `📸 [ছবি]: "${caption || 'নোট ছবি'}"`, reply);
      return;
    }

    // ৩. সাধারণ ছবি
    let descReply = `📸 *ছবিটিতে যা দেখা যাচ্ছে:*\n\n${(result && result.description) || (docResult && docResult.summary) || 'একটি ছবি পেয়েছি।'}\n\n`;
    descReply += `📁 _মূল ছবিটি ফাইলে সংরক্ষিত রয়েছে: ${savedImg.relativePath}_\n`;
    descReply += `_এটি নিয়ে কি কোনো রিমাইন্ডার দিতে চাও? যেমন: "১০ মিনিট পর মনে করিয়ে দাও"_`;
    await sendBotReply(msg, descReply);
    webDashboard.addLiveChatLog(userName || 'Owner', `📸 [ছবি]`, descReply);

  } catch (err) {
    console.error('❌ ছবি প্রসেস সমস্যা:', err.message);
    await sendBotReply(msg, '❌ ছবি প্রসেস করতে কিছুটা সমস্যা হয়েছে। আবার চেষ্টা করো।');
  }
}

// ─── Document Message Handler (Section 7) ─────────────────────
async function handleDocumentMessage(msg, userId, userName) {
  try {
    const media = await msg.downloadMedia();
    if (!media || !media.data) {
      await sendBotReply(msg, '❌ ফাইলটি ডাউনলোড করতে পারলাম না।');
      return;
    }

    const rawExt = msg.filename ? path.extname(msg.filename).replace('.', '') : 'pdf';
    const buffer = Buffer.from(media.data, 'base64');
    const saved = saveMediaAttachment(buffer, rawExt || 'doc', 'doc');

    let textPreview = '';
    if (['txt', 'csv', 'json', 'md'].includes((rawExt || '').toLowerCase())) {
      textPreview = buffer.toString('utf8').slice(0, 500);
    }

    const memId = db.saveMemory(userId, {
      memoryType: 'document',
      sourceType: 'document',
      originalRef: saved.relativePath,
      title: msg.filename || 'সংযুক্ত ফাইল',
      content: textPreview || `ডকুমেন্ট ফাইল: ${msg.filename || 'অজানা'} (${rawExt})`,
      structuredData: { filename: msg.filename, size: buffer.length, mimeType: media.mimetype },
      topics: rawExt,
    });

    const reply =
      `📄 *ফাইল/ডকুমেন্ট মেমরিতে সংরক্ষিত হয়েছে! (#M${memId})*\n\n` +
      `📌 *ফাইল:* ${msg.filename || 'ডকুমেন্ট'}\n` +
      `📁 *রেফারেন্স:* ${saved.relativePath}\n\n` +
      `_প্রয়োজনে পরবর্তীতে জানতে পারো: "আগের ফাইলে কী ছিল?" বা "ফাইলটি দেখাও"_`;

    await sendBotReply(msg, reply);
    webDashboard.addLiveChatLog(userName || 'Owner', `📄 [ফাইল]: "${msg.filename || 'ডকুমেন্ট'}"`, reply);
  } catch (err) {
    console.error('❌ ডকুমেন্ট প্রসেস সমস্যা:', err.message);
    await sendBotReply(msg, '❌ ফাইলটি সংরক্ষণ করতে সমস্যা হয়েছে।');
  }
}

// ─── Location Message Handler ─────────────────────────────────
async function handleLocationMessage(msg, userId, userName) {
  const { latitude, longitude, description } = msg;

  console.log(`📍 লোকেশন [${userName || userId}]: ${latitude}, ${longitude} (${description || 'N/A'})`);

  // Check GPS-based triggers
  const gpsTriggers = locationDb.checkLocationTrigger(userId, latitude, longitude);

  // Check place name triggers
  const nameTriggers = locationDb.checkPlaceNameTrigger(userId, description);

  const allTriggers = [...gpsTriggers];
  // Add name triggers that aren't already in GPS triggers
  for (const t of nameTriggers) {
    if (!allTriggers.find(x => x.id === t.id)) allTriggers.push(t);
  }

  if (allTriggers.length === 0) {
    // No matching location reminder, just acknowledge
    const locAck = `📍 *লোকেশন পেয়েছি!*\n\nকোনো লোকেশন রিমাইন্ডার ট্রিগার হয়নি।\n\n_লোকেশন রিমাইন্ডার সেট করতে লেখো:_\n_লোকেশন রিমাইন্ডার: জায়গার নাম → কাজ_`;
    await sendBotReply(msg, locAck);
    webDashboard.addLiveChatLog(userName || 'Owner', `📍 [লোকেশন]: ${latitude}, ${longitude}`, locAck);
    return;
  }

  // Trigger all matching reminders
  for (const reminder of allTriggers) {
    const remText = `📍 *লোকেশন রিমাইন্ডার!*\n\n🏪 তুমি *${reminder.place_name}*-এ পৌঁছেছো!\n\n📌 মনে রাখো: *${reminder.reminder_text}*`;
    await sendBotReply(msg, remText);
    webDashboard.addLiveChatLog(userName || 'Owner', `📍 [লোকেশন]: ${latitude}, ${longitude} (${reminder.place_name})`, remText);
  }
}

// ─── Reminder Scheduler & Worker ─────────────────────────────
let isSchedulerStarted = false;
function startReminderScheduler() {
  if (isSchedulerStarted) return;
  isSchedulerStarted = true;

  // Start continuous, durable background worker
  reminderWorker.startReminderWorker({
    client,
    sendBotReply,
    getOwnerPhone,
    checkIntervalMs: 5000,
  });

  // Daily automated cloud backup at midnight (00:00)
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('☁️ দৈনিক ক্লাউড ব্যাকআপ তৈরি হচ্ছে...');
      const backup = await cloudBackup.createCloudBackup();
      console.log(`✅ স্বয়ংক্রিয় ক্লাউড ব্যাকআপ সম্পন্ন: ${backup.fileName}`);
    } catch (e) {
      console.error('❌ স্বয়ংক্রিয় ব্যাকআপে সমস্যা:', e.message);
    }
  });
  console.log('☁️ স্বয়ংক্রিয় ক্লাউড ব্যাকআপ স্কেডিউলার চালু (প্রতিদিন মধ্যরাত)।');
}

// ─── Auth Events ──────────────────────────────────────────────
client.on('authenticated', () => console.log('🔐 WhatsApp অথেন্টিকেশন সফল!'));
client.on('auth_failure', (msg) => console.error('❌ অথেন্টিকেশন ব্যর্থ:', msg));

let isReconnecting = false;
client.on('disconnected', async (reason) => {
  console.log('🔌 সংযোগ বিচ্ছিন্ন:', reason, '— পুনরায় সংযোগের প্রস্তুতি...');
  webDashboard.updateBotState({
    status: 'DISCONNECTED',
    userName: null,
    userPhone: null,
    qrDataUrl: null,
  });
  offline.setOnline(false);
  // Show desktop notification that bot is offline
  offline.showDesktopNotification(
    'সংযোগ বিচ্ছিন্ন!',
    'ফ্রেন্ড অফলাইন। রিমাইন্ডার Desktop-এ দেখাবে।'
  );

  if (isReconnecting) return;
  isReconnecting = true;

  try {
    await client.destroy();
  } catch (_) {}

  // If disconnected due to LOGOUT, clean up the stale session directory
  if (reason === 'LOGOUT') {
    const sessionDir = path.join(__dirname, 'data', '.wwebjs_auth', 'session');
    try {
      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    } catch (_) {}
  }

  setTimeout(async () => {
    try {
      console.log('🔄 পুনরায় ফ্রেন্ড ক্লায়েন্ট চালু হচ্ছে...');
      await safeInitialize();
    } catch (err) {
      console.error('❌ পুনরায় সংযোগে সমস্যা:', err.message);
    } finally {
      isReconnecting = false;
    }
  }, 4000);
});

// ─── Graceful Shutdown ────────────────────────────────────────
const shutdownGracefully = async (signal) => {
  process.stderr.write(`\n🛑 [SHUTDOWN] Signal ${signal} received: shutting down...\n`);
  try {
    await client.destroy();
  } catch (_) {}
  process.exit(0);
};

// ─── Safe Client Initializer (Auto-retry & Detached Frame Recovery) ─────
let isInitializing = false;
let initRetryCount = 0;
async function safeInitialize() {
  if (isInitializing) {
    console.log('⏳ ক্লায়েন্ট ইতিমধ্যে চালু হওয়ার প্রক্রিয়ায় আছে...');
    return;
  }
  isInitializing = true;
  try {
    // Clean up any stale Chromium devtools/lock files that cause frame detachment
    try {
      const lockFiles = ['DevToolsActivePort', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
      const sessionDir = path.join(__dirname, 'data', '.wwebjs_auth', 'session');
      for (const lf of lockFiles) {
        const fp = path.join(sessionDir, lf);
        if (fs.existsSync(fp)) fs.rmSync(fp, { force: true });
      }
    } catch (_) {}

    await client.initialize();
    initRetryCount = 0;
  } catch (err) {
    console.error('❌ ক্লায়েন্ট ইনিশিয়ালাইজেশনে সমস্যা:', err.message);
    initRetryCount++;
    if (initRetryCount <= 3) {
      console.log(`🔄 ফ্রেন্ড ক্লায়েন্ট রিকভারি চলছে (${initRetryCount}/3)... ৩ সেকেন্ডে পুনরায় চেষ্টা হচ্ছে...`);
      try { await client.destroy(); } catch (_) {}
      setTimeout(() => {
        isInitializing = false;
        safeInitialize();
      }, 3000);
      return;
    }
  } finally {
    isInitializing = false;
  }
}

// ─── Start ────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   🤖 FREND v2 — WhatsApp Memory Bot      ║');
console.log('║   AI · Calendar · Voice · Location       ║');
console.log('║   Gamify · Multi-Device · Smart Timing   ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// Register Test Chat Handler for Web Dashboard UI
webDashboard.setTestChatHandler(async (text) => {
  const users = authManager.getAllUsers();
  const adminUser = users.find(u => u.role === 'admin') || users[0];
  const ownerUserId = adminUser?.bound_phone || (adminUser ? `${adminUser.username}@c.us` : 'admin@c.us');
  const ownerName = adminUser ? (adminUser.display_name || adminUser.username) : 'Admin';
  return await handleMessage(ownerUserId, ownerName, text);
});

// Register Bot Client with Web Dashboard (Enables UI restart/logout & Laravel API)
webDashboard.setBotClient(client, async () => {
  console.log('🔄 ওয়েব ড্যাশবোর্ড / Laravel API থেকে বট রিস্টার্ট হচ্ছে...');
  if (isReconnecting) return;
  isReconnecting = true;
  try {
    await client.destroy();
  } catch (_) {}
  webDashboard.updateBotState({ status: 'INITIALIZING', qrDataUrl: null });
  setTimeout(async () => {
    try {
      await safeInitialize();
    } catch (err) {
      console.error('❌ রিস্টার্টে সমস্যা:', err.message);
    } finally {
      isReconnecting = false;
    }
  }, 2000);
}, sendBotReply);

// Start autonomous background reminder worker immediately on boot
startReminderScheduler();

console.log('🚀 ফ্রেন্ড বট বুট সম্পন্ন। হোয়াটসঅ্যাপ ক্লায়েন্ট প্রস্তুত হচ্ছে...\n');

setTimeout(() => {
  safeInitialize();
}, 1500);
