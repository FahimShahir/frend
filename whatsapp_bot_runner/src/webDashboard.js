/**
 * Multi-Device Sync & Web Dashboard — Frend Bot
 * ফোন, ট্যাবলেট এবং কম্পিউটার—সব ডিভাইসে রিমাইন্ডার সিঙ্ক এবং ইন্টারেক্টিভ ওয়েব ড্যাশবোর্ড।
 */

'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./database');
const calendarSync = require('./calendarSync');
const gamification = require('./gamification');
const analytics = require('./analytics');
const { getWeeklyCalendar, getMonthlyCalendar } = require('./calendarView');
const cloudBackup = require('./cloudBackup');
const authManager = require('./authManager');
const aiConfig = require('./aiConfig');
const selfHealingEngine = require('./selfHealingEngine');
const selfUpdateEngine = require('./selfUpdateEngine');
const featureFlags = require('./featureFlags');

// ─── Bot State Management for UI & Laravel Integration ───────
let botState = {
  status: 'INITIALIZING', // 'INITIALIZING', 'WAITING_FOR_QR', 'CONNECTED', 'DISCONNECTED'
  qrRaw: null,
  qrDataUrl: null,
  pairingCode: null,
  userName: null,
  userPhone: null,
  connectedAt: null,
  clientRef: null,
  onRestartRequest: null,
};

function updateBotState(patch) {
  botState = { ...botState, ...patch };
}

async function setQrCode(qr) {
  try {
    const dataUrl = await QRCode.toDataURL(qr, {
      width: 280,
      margin: 2,
      color: { dark: '#0b0f19', light: '#ffffff' },
    });
    botState.status = 'WAITING_FOR_QR';
    botState.qrRaw = qr;
    botState.qrDataUrl = dataUrl;
  } catch (err) {
    console.error('QR কোড তৈরিতে সমস্যা:', err.message);
  }
}

function setBotClient(client, onRestart, sendReplyFn) {
  botState.clientRef = client;
  if (onRestart) botState.onRestartRequest = onRestart;
  if (sendReplyFn) botState.sendReplyFn = sendReplyFn;
}

function getBotState() {
  return botState;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ─── Live Chat & Bot Response Logger ──────────────────────────
const liveChatLogs = [];
let testChatHandler = null;

function addLiveChatLog(user, incoming, reply) {
  const timeStr = new Date().toLocaleTimeString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  liveChatLogs.unshift({
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    time: timeStr,
    user: user || 'আপনি (You)',
    incoming: incoming || '',
    reply: reply || '',
  });
  if (liveChatLogs.length > 50) {
    liveChatLogs.pop();
  }
}

function getLiveChatLogs() {
  return liveChatLogs;
}

function clearLiveChatLogs() {
  liveChatLogs.length = 0;
}

function setTestChatHandler(fn) {
  testChatHandler = fn;
}

function getFirstUserId() {
  if (botState.userPhone) {
    const user = db.getOrCreateUser(`${botState.userPhone}@c.us`, botState.userName || 'Owner');
    return user.id;
  }
  // Check authManager users first (Admin or first registered user)
  const authUsers = authManager.getAllUsers();
  if (authUsers && authUsers.length > 0) {
    const adminUser = authUsers.find(u => u.role === 'admin') || authUsers[0];
    return adminUser.id;
  }
  const users = db.getAllUsers();
  if (users && users.length > 0) {
    return users[0].id;
  }
  const user = db.getOrCreateUser('default_user', 'Frend User');
  return user.id;
}

function serverEscapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderUserRowsHtml() {
  const users = authManager.getAllUsers();
  if (!users || users.length === 0) {
    return '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">কোনো ইউজার পাওয়া যায়নি। উপরে নতুন ইউজার যোগ করুন।</td></tr>';
  }
  return users.map(u => {
    const isBound = !!u.bound_phone;
    const phoneBadge = isBound
      ? ('<span class="status-badge active">📱 ' + serverEscapeHtml(u.bound_phone) + '</span>')
      : '<span class="status-badge unbound">⚪ আনবাইন্ড</span>';
    const statusBadge = (u.status === 'active')
      ? '<span class="status-badge active">🟢 সক্রিয়</span>'
      : '<span class="status-badge blocked">🔴 নিষ্ক্রিয়</span>';
    const roleBadge = u.role === 'admin'
      ? '<span class="status-badge admin">👑 Admin</span>'
      : '<span class="status-badge unbound">👤 User</span>';
    
    const planSelect = '<select onchange="changeUserPlan(' + u.id + ', this.value)" style="background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.15); color:#c7d2fe; border-radius:6px; padding:3px 8px; font-size:11px;">' +
      '<option value="free"' + (u.assigned_plan_id === 'free' ? ' selected' : '') + '>Free</option>' +
      '<option value="pro"' + (u.assigned_plan_id === 'pro' ? ' selected' : '') + '>Pro</option>' +
      '<option value="enterprise"' + (u.assigned_plan_id === 'enterprise' ? ' selected' : '') + '>Enterprise</option>' +
    '</select>';

    const statusBtn = (u.status === 'active')
      ? ('<button onclick="disableUser(' + u.id + ')" class="btn-table-action" style="background:rgba(239,68,68,0.2); color:#fca5a5;" title="অ্যাকাউন্ট সাময়িকভাবে বন্ধ করুন">⛔ Disable</button>')
      : ('<button onclick="enableUser(' + u.id + ')" class="btn-table-action" style="background:rgba(34,197,94,0.2); color:#86efac;" title="অ্যাকাউন্ট সক্রিয় করুন">✅ Enable</button>');

    const calBtn = '<a href="/oauth2/google/connect?userId=' + u.id + '" target="_blank" class="btn-table-action" style="background:rgba(99,102,241,0.2); color:#c7d2fe; text-decoration:none;" title="এই ইউজারের Google Calendar কানেক্ট করুন">🔗 Connect</a>';

    const unbindBtn = isBound
      ? ('<button onclick="unbindUserPhone(' + u.id + ')" class="btn-table-action unbind" title="WhatsApp নম্বর ডিসকানেক্ট">🔌 আনবাইন্ড</button>')
      : '';

    const pwdBtn = '<button onclick="openUpdatePasswordModal(' + u.id + ', \'' + serverEscapeHtml(u.username) + '\')" class="btn-table-action" style="background:rgba(234,179,8,0.2); color:#fde047;" title="পাসওয়ার্ড আপডেট করুন">🔑 পাসওয়ার্ড</button>';
    
    return '<tr id="user-row-' + u.id + '">' +
      '<td style="color:var(--text-muted); font-weight:600;">#' + u.id + '</td>' +
      '<td><strong style="color:#60a5fa;">' + serverEscapeHtml(u.username) + '</strong></td>' +
      '<td>' + serverEscapeHtml(u.display_name || '-') + '</td>' +
      '<td>' + planSelect + '</td>' +
      '<td>' + phoneBadge + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + roleBadge + '</td>' +
      '<td>' + calBtn + '</td>' +
      '<td>' +
        statusBtn +
        pwdBtn +
        unbindBtn +
        '<button onclick="deleteUser(' + u.id + ')" class="btn-table-action del">🗑️ মুছুন</button>' +
      '</td>' +
    '</tr>';
  }).join('');
}

/**
 * Modern, Ultra-sleek Multi-Device HTML Dashboard
 */
function renderDashboardHtml(userId) {
  if (!userId) userId = getFirstUserId();
  const profile = gamification.getUserProfile(userId);
  const userStats = db.getUserStats(userId);
  const calConfigured = calendarSync.isConfigured();
  const isConnected = (botState.status === 'CONNECTED');
  const isWaitingQr = (botState.status === 'WAITING_FOR_QR' && botState.qrDataUrl);

  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FREND — মাল্টি-ডিভাইস রিমাইন্ডার ও ক্যালেন্ডার</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(22, 27, 46, 0.75);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #25d366;
      --primary-hover: #1ebd59;
      --accent: #6366f1;
      --accent-gradient: linear-gradient(135deg, #6366f1, #a855f7);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --danger: #ef4444;
      --gold: #f59e0b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hind Siliguri', 'Inter', -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      background-image: 
        radial-gradient(circle at 15% 20%, rgba(99, 102, 241, 0.12) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(37, 211, 102, 0.1) 0%, transparent 40%);
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      gap: 16px;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 16px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon {
      font-size: 32px;
      background: rgba(37, 211, 102, 0.15);
      border: 1px solid rgba(37, 211, 102, 0.3);
      padding: 8px 12px;
      border-radius: 12px;
    }
    .brand-title h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .brand-title p { font-size: 13px; color: var(--text-muted); }
    .sync-status-bar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
    }
    .badge.active { background: rgba(37, 211, 102, 0.15); border-color: rgba(37, 211, 102, 0.4); color: #25d366; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }
    .card {
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    /* Gamification Section */
    .xp-bar-container {
      background: rgba(255, 255, 255, 0.08);
      height: 10px;
      border-radius: 5px;
      overflow: hidden;
      margin: 10px 0;
    }
    .xp-bar-fill {
      background: var(--accent-gradient);
      height: 100%;
      border-radius: 5px;
      transition: width 0.4s ease;
    }
    .gamify-stats {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      text-align: center;
      margin-top: 14px;
    }
    .stat-box {
      background: rgba(255, 255, 255, 0.04);
      padding: 10px;
      border-radius: 10px;
    }
    .stat-val { font-size: 20px; font-weight: 700; color: #fff; }
    .stat-label { font-size: 11px; color: var(--text-muted); }
    .badges-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .badge-chip {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #fbbf24;
      padding: 4px 10px;
      border-radius: 16px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    /* Reminder List */
    .reminder-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      margin-bottom: 10px;
      transition: all 0.2s;
    }
    .reminder-item:hover {
      background: rgba(255, 255, 255, 0.06);
      transform: translateY(-1px);
    }
    .reminder-text { font-weight: 600; font-size: 14px; color: #fff; }
    .reminder-time { font-size: 12px; color: var(--text-muted); }
    .btn-done {
      background: var(--primary);
      color: #000;
      border: none;
      padding: 6px 14px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
    }
    .btn-done:hover { background: var(--primary-hover); }
    .add-input-box {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .add-input-box input {
      flex: 1;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 13px;
    }
    .add-input-box button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    /* Calendar Grid */
    .calendar-widget {
      width: 100%;
      border-collapse: collapse;
      text-align: center;
      font-size: 13px;
    }
    .calendar-widget th {
      padding: 8px 4px;
      color: var(--text-muted);
      font-weight: 500;
    }
    .calendar-widget td {
      padding: 10px 4px;
      border-radius: 8px;
      cursor: pointer;
    }
    .calendar-widget td.today {
      background: rgba(99, 102, 241, 0.25);
      border: 1px solid var(--accent);
      color: #fff;
      font-weight: 700;
    }
    .calendar-widget td.has-event {
      color: var(--primary);
      font-weight: 700;
      position: relative;
    }
    .calendar-widget td.has-event::after {
      content: '•';
      display: block;
      font-size: 16px;
      line-height: 4px;
      color: var(--primary);
    }
    /* WhatsApp Admin & Live QR Code Scanner */
    .whatsapp-admin-card {
      background: linear-gradient(135deg, rgba(22, 27, 46, 0.85), rgba(15, 23, 42, 0.85));
      border: 1px solid rgba(37, 211, 102, 0.3);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }
    .live-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
    }
    .live-dot.online { background: #25d366; box-shadow: 0 0 10px #25d366; }
    .live-dot.waiting { background: #f59e0b; box-shadow: 0 0 10px #f59e0b; animation: pulse 1.5s infinite; }
    .live-dot.offline { background: #ef4444; }
    @keyframes pulse {
      0% { opacity: 0.4; }
      50% { opacity: 1; }
      100% { opacity: 0.4; }
    }
    .qr-box-wrapper {
      display: flex;
      flex-wrap: wrap;
      gap: 24px;
      align-items: center;
      justify-content: space-between;
    }
    .qr-info-side { flex: 1; min-width: 280px; }
    .qr-img-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-frame {
      background: #ffffff;
      padding: 12px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 230px;
      min-height: 230px;
    }
    .wa-connected-banner {
      display: flex;
      align-items: center;
      gap: 16px;
      background: rgba(37, 211, 102, 0.08);
      border: 1px solid rgba(37, 211, 102, 0.25);
      padding: 16px;
      border-radius: 12px;
    }
    .btn-ctrl {
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: all 0.2s;
    }
    .btn-ctrl.btn-secondary {
      background: rgba(99, 102, 241, 0.2);
      border: 1px solid rgba(99, 102, 241, 0.4);
      color: #c7d2fe;
    }
    .btn-ctrl.btn-secondary:hover { background: rgba(99, 102, 241, 0.35); }
    .btn-ctrl.btn-danger {
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }
    .btn-ctrl.btn-danger:hover { background: rgba(239, 68, 68, 0.35); }
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: #25d366;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Live Chat Stream Card Styles */
    .live-chat-card {
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95));
      border: 1px solid rgba(99, 102, 241, 0.35);
      border-radius: 16px;
      padding: 20px;
      margin-bottom: 24px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }
    .live-chat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--card-border);
      flex-wrap: wrap;
      gap: 10px;
    }
    .live-chat-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: #fff;
    }
    .live-stream-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(37, 211, 102, 0.12);
      border: 1px solid rgba(37, 211, 102, 0.3);
      color: #25d366;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    .chat-stream-box {
      max-height: 380px;
      min-height: 180px;
      overflow-y: auto;
      padding: 14px;
      background: rgba(11, 15, 25, 0.75);
      border-radius: 12px;
      border: 1px solid var(--card-border);
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .chat-stream-box::-webkit-scrollbar { width: 6px; }
    .chat-stream-box::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.3); border-radius: 4px; }
    .chat-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-bottom: 12px;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
    }
    .chat-item:last-child { border-bottom: none; padding-bottom: 0; }
    .bubble-user {
      align-self: flex-end;
      max-width: 85%;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: #fff;
      padding: 10px 14px;
      border-radius: 14px 14px 2px 14px;
      box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
      font-size: 13px;
    }
    .bubble-user .meta {
      font-size: 11px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-weight: 600;
    }
    .bubble-bot {
      align-self: flex-start;
      max-width: 85%;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(37, 211, 102, 0.35);
      color: #e2e8f0;
      padding: 12px 16px;
      border-radius: 14px 14px 14px 2px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      font-size: 13px;
      line-height: 1.5;
    }
    .bubble-bot .meta {
      font-size: 11px;
      color: #25d366;
      margin-bottom: 6px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    .chat-test-bar {
      display: flex;
      gap: 8px;
      margin-top: 14px;
    }
    .chat-test-bar input {
      flex: 1;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 10px 14px;
      color: #fff;
      font-size: 13px;
    }
    .chat-test-bar button {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: opacity 0.2s;
    }
    .chat-test-bar button:hover { opacity: 0.9; }

    /* User Management & AI Settings Styles */
    .section-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 22px;
      margin-bottom: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }
    .user-table-wrap {
      overflow-x: auto;
      margin-top: 16px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.07);
    }
    .user-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      text-align: left;
    }
    .user-table th {
      background: rgba(255, 255, 255, 0.05);
      padding: 12px 14px;
      color: var(--text-muted);
      font-weight: 600;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
    }
    .user-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: #fff;
      vertical-align: middle;
    }
    .user-table tr:hover { background: rgba(255, 255, 255, 0.02); }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-badge.active { background: rgba(37, 211, 102, 0.15); color: #25d366; border: 1px solid rgba(37, 211, 102, 0.3); }
    .status-badge.blocked { background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
    .status-badge.unbound { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
    .status-badge.admin { background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
    .btn-table-action {
      border: none;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      margin-right: 4px;
      transition: all 0.2s;
    }
    .btn-table-action.unbind { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); }
    .btn-table-action.unbind:hover { background: rgba(245, 158, 11, 0.35); }
    .btn-table-action.edit { background: rgba(99, 102, 241, 0.2); color: #c7d2fe; border: 1px solid rgba(99, 102, 241, 0.4); }
    .btn-table-action.edit:hover { background: rgba(99, 102, 241, 0.35); }
    .btn-table-action.del { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); }
    .btn-table-action.del:hover { background: rgba(239, 68, 68, 0.35); }
    .form-panel {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      margin-top: 14px;
    }
    .form-grid-4 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)) auto;
      gap: 12px;
      align-items: flex-end;
    }
    .field-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
      font-weight: 600;
      display: block;
    }
    .input-ctrl {
      width: 100%;
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 9px 12px;
      color: #fff;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .input-ctrl:focus { border-color: var(--accent); }
    .btn-primary-action {
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      border: none;
      padding: 10px 18px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      transition: opacity 0.2s;
    }
    .btn-primary-action:hover { opacity: 0.9; }
    .ai-config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 14px;
    }
    .ai-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
    }
    .ai-test-badge {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="brand-icon">🤖</div>
        <div class="brand-title">
          <h1>ফ্রেন্ড (FREND) — মাল্টি-ডিভাইস হাব</h1>
          <p>ফোন · ট্যাবলেট · কম্পিউটার — রিয়েল-টাইম ক্লাউড সিঙ্ক</p>
        </div>
      </div>
      <div class="sync-status-bar">
        <!-- User Profile Switcher -->
        <div style="display:flex; align-items:center; gap:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:4px 10px;">
          <span style="font-size:12px; color:#cbd5e1;">👤 সক্রিয় প্রোফাইল:</span>
          <select id="headerUserSelect" onchange="window.location.href='/?userId='+encodeURIComponent(this.value)" style="background:transparent; border:none; color:#60a5fa; font-weight:700; font-size:12px; outline:none; cursor:pointer;">
            ${(authManager.getAllUsers() || []).map(u => {
              const isSelected = String(u.id) === String(userId) || String(u.username) === String(userId);
              return `<option value="${serverEscapeHtml(u.id)}" ${isSelected ? 'selected' : ''} style="background:#111827; color:#fff;">${u.role === 'admin' ? '👑 ' : ''}${serverEscapeHtml(u.display_name || u.username)} (#${u.id}${u.role === 'admin' ? ' - Admin' : ''})</option>`;
            }).join('')}
          </select>
        </div>
        <div class="badge ${isConnected ? 'active' : ''}" id="headerWaBadge">${isConnected ? '🟢 WhatsApp সংযুক্ত' : (isWaitingQr ? '🟡 QR স্ক্যান বাকি' : '⚪ শুরু হচ্ছে...')}</div>
        <div class="badge ${calConfigured ? 'active' : ''}">📅 Google Calendar ${calConfigured ? 'যুক্ত' : 'অফ'}</div>
        <a href="/api/backup/download" class="badge active" style="text-decoration:none;cursor:pointer;color:#25d366;" download>☁️ ক্লাউড ব্যাকআপ ডাউনলোড</a>
      </div>
    </header>

    <!-- WhatsApp Admin & Live QR Code Scanner -->
    <div class="whatsapp-admin-card" id="whatsappAdminCard">
      <div class="card-title">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>📱 WhatsApp লাইভ স্ক্যানার ও কন্ট্রোল প্যানেল</span>
          <span class="live-dot ${isConnected ? 'online' : (isWaitingQr ? 'waiting' : 'offline')}" id="botStatusDot"></span>
          <span id="botStatusText" style="font-size: 13px; color: var(--text-muted);">${isConnected ? 'অনলাইনে সংযুক্ত' : (isWaitingQr ? 'স্ক্যানের অপেক্ষায়...' : 'শুরু হচ্ছে...')}</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="triggerBotRestart()" class="btn-ctrl btn-secondary">🔄 রিস্টার্ট বট</button>
          <button onclick="triggerClearSession()" class="btn-ctrl btn-secondary" title="পুরোনো ক্যাশ/সেশন মুছে নতুন QR আনবে">🧹 সেশন রিসেট</button>
          <button onclick="openDatabaseResetModal()" class="btn-ctrl btn-danger" style="background: rgba(239, 68, 68, 0.18); color: #fca5a5; border-color: rgba(239, 68, 68, 0.35);" title="ডাটাবেস রিসেট অপশন">⚠️ ডাটাবেস রিসেট</button>
          <button onclick="triggerBotLogout()" id="btnLogout" class="btn-ctrl btn-danger" style="display:${isConnected ? 'inline-block' : 'none'};">🔌 ডিসকানেক্ট</button>
        </div>
      </div>

      <!-- State 1: Connected State -->
      <div id="waConnectedState" style="display:${isConnected ? 'block' : 'none'}; padding: 6px 0;">
        <div class="wa-connected-banner">
          <div style="font-size: 32px;">🟢</div>
          <div>
            <h3 style="color:#25d366; font-size: 18px;">WhatsApp সফলভাবে সংযুক্ত ও সক্রিয়!</h3>
            <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">
              সংযুক্ত অ্যাকাউন্ট: <strong id="waUserPhone" style="color:#fff;">${botState.userPhone || 'সক্রিয়'}</strong> 
              <span id="waUserName">${botState.userName ? '(' + botState.userName + ')' : ''}</span> 
              <span id="waConnectedTime">${botState.connectedAt ? '· কানেক্টেড: ' + new Date(botState.connectedAt).toLocaleTimeString('bn-BD') : ''}</span>
            </p>
            <p style="color: #c7d2fe; font-size: 12px; margin-top: 6px;">
              🚀 <em>Laravel / PHP API চালু:</em> <code>POST http://localhost:3000/api/send-message</code>
            </p>
          </div>
        </div>
      </div>

      <!-- State 2: Waiting for QR Scan -->
      <div id="waQrState" style="display:${isConnected ? 'none' : 'block'}; padding: 6px 0;">
        <div class="qr-box-wrapper">
          <div class="qr-info-side">
            <h3 style="font-size: 18px; color: #fff; margin-bottom: 8px;">টার্মিনাল ছাড়া সরাসরি এই ড্যাশবোর্ড থেকেই স্ক্যান করুন</h3>
            <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6;">
              ১. আপনার ফোনের <strong>WhatsApp</strong> খুলুন।<br>
              ২. <strong>Settings (বা তিনটি ডট ⋮)</strong> ➔ <strong>Linked Devices</strong> ➔ <strong>Link a Device</strong>-এ যান।<br>
              ৩. ডানদিকের কিউআর কোডটি স্ক্যান করুন।
            </p>
            <div style="margin-top: 14px; font-size: 12px; color: #9ca3af; display: flex; align-items: center; gap: 6px;">
              <span class="live-dot waiting"></span> <em>কিউআর কোডটি লাইভ স্বয়ংক্রিয়ভাবে আপডেট হচ্ছে (টার্মিনাল লাগবে না)</em>
            </div>

            <!-- Troubleshoot Banner -->
            <div style="margin-top: 14px; padding: 12px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; font-size: 12px; line-height: 1.6;">
              <strong style="color: #fca5a5;">💡 "Can't link device" সমস্যা হলে করণীয়:</strong><br>
              • ফোনে WhatsApp ➔ <strong>Linked Devices</strong>-এ ৪টি ডিভাইস পূর্ণ থাকলে পুরোনো ডিভাইস Log Out করুন।<br>
              • উপরের <strong>"🧹 সেশন রিসেট"</strong> বাটনে ক্লিক করে ফ্রেশ QR আনুন।<br>
              • অথবা ক্যামেরা ছাড়া নিচে <strong>ফোন নম্বর দিয়ে লিঙ্ক</strong> করুন।
            </div>

            <!-- Alternative: Pair with Phone Number -->
            <div style="margin-top: 14px; padding: 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--card-border); border-radius: 10px;">
              <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px;">📱 বিকল্প: ক্যামেরা ছাড়া নম্বর দিয়ে লিঙ্ক করুন</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">ক্যামেরা দিয়ে স্ক্যান না হলে এখানে কান্ট্রি কোড সহ নম্বর দিন (যেমন: 8801XXXXXXXXX):</div>
              <div style="display: flex; gap: 8px;">
                <input type="text" id="pairingPhoneInput" placeholder="8801XXXXXXXXX" style="flex:1; background:rgba(255,255,255,0.06); border:1px solid var(--card-border); border-radius:8px; padding:8px 12px; color:#fff; font-size:13px;">
                <button onclick="requestPairingCodeUI()" class="btn-primary-action" style="padding:8px 14px; font-size:12px;">🔑 কোড পান</button>
              </div>
              <div id="pairingCodeDisplay" style="display:none; margin-top:10px; padding:10px; background:rgba(37,211,102,0.12); border:1px dashed rgba(37,211,102,0.4); border-radius:8px; text-align:center;">
                <div style="font-size:12px; color:#86efac; margin-bottom:4px;">আপনার WhatsApp-এ Linked Devices ➔ Link with phone number-এ কোডটি দিন:</div>
                <div id="pairingCodeText" style="font-size:24px; font-weight:800; letter-spacing:4px; color:#25d366; font-family:monospace;"></div>
              </div>
            </div>
          </div>
          <div class="qr-img-side">
            <div class="qr-frame" id="qrFrame">
              <img id="dashboardQrImg" src="${botState.qrDataUrl || ''}" alt="WhatsApp QR Code" style="display:${isWaitingQr ? 'block' : 'none'}; width: 200px; height: 200px; border-radius: 8px;">
              <div id="qrLoadingSpinner" style="display:${isWaitingQr ? 'none' : 'block'}; color: #64748b; text-align: center; padding: 40px 10px;">
                <div class="spinner"></div>
                <div style="margin-top: 12px; font-size: 13px; color: #475569;">${isWaitingQr ? '' : (isConnected ? 'সংযুক্ত আছে' : 'QR কোড প্রস্তুত হচ্ছে...')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Live WhatsApp Chat & Bot Response Stream Card -->
    <div class="live-chat-card" id="liveChatCard">
      <div class="live-chat-header">
        <div class="live-chat-title">
          <span>💬 লাইভ চ্যাট ও বট রেসপন্স স্ট্রিম</span>
          <span class="live-stream-badge">
            <span class="live-dot online"></span> লাইভ রিয়েল-টাইম সিঙ্ক
          </span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button onclick="clearLiveChatLogsUI()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px;">🗑️ লগ মুছুন</button>
        </div>
      </div>

      <div class="chat-stream-box" id="chatStreamBox">
        <div style="text-align: center; color: var(--text-muted); padding: 35px 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
          <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">লাইভ চ্যাট লোড হচ্ছে...</div>
        </div>
      </div>

      <div class="chat-test-bar">
        <input type="text" id="testChatInput" placeholder="ড্যাশবোর্ড থেকেও বট টেস্ট করতে পারেন (যেমন: হ্যালো / মনে রাখো পাসওয়ার্ড ১২৩৪ / কাল সকাল ৯টায় মিটিং)..." onkeydown="if(event.key==='Enter') sendTestChatMessage()">
        <button onclick="sendTestChatMessage()">🚀 টেস্ট পাঠান</button>
      </div>
    </div>

    <!-- User Management & Access Control Card -->
    <div class="section-card" id="userManagementCard">
      <div class="card-title">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>👥 মাল্টি-ইউজার একাউন্ট ও প্ল্যান ম্যানেজমেন্ট (Multi-User RBAC)</span>
          <span class="badge active" style="font-size: 11px;">🛡️ আইসোলেটেড ডাটা</span>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="openEvolutionModal()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px; background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border-color: rgba(99, 102, 241, 0.3);">🚀 ইভোলিউশন ও সেলফ-আপডেট (Evolution)</button>
          <button onclick="openSelfHealingModal()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px; background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.3);">🩺 সেলফ-হিলিং (Self-Healing)</button>
          <button onclick="openAuditLogsModal()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px;">📜 অডিট লগ (Audit Logs)</button>
          <button onclick="openDatabaseResetModal()" class="btn-ctrl btn-danger" style="font-size: 11px; padding: 5px 10px; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border-color: rgba(239, 68, 68, 0.4);" title="ডাটাবেস রিসেট ও ক্যাশ ক্লিয়ার">⚠️ ডাটাবেস রিসেট</button>
          <button onclick="loadUsers()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px;">🔄 রিফ্রেশ তালিকা</button>
        </div>
      </div>
      <p style="color: var(--text-muted); font-size: 13px; line-height: 1.6; margin-top: 4px;">
        প্রতিটি ইউজারের ডাটা, মেমরি ও ক্যালেন্ডার সম্পূর্ণ আইসোলেটেড। যেকোনো অ্যাকাউন্ট সাময়িকভাবে বন্ধ (Disable) বা সক্রিয় (Enable) করা যায় এবং প্ল্যান বরাদ্দ করা যায়।
      </p>

      <!-- Add New User Form -->
      <div class="form-panel">
        <div style="font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 10px;">➕ নতুন ইউজার তৈরি ও প্ল্যান বরাদ্দ:</div>
        <div class="form-grid-4" style="grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));">
          <div>
            <label class="field-label">ইউজারনেম (Login Username)*</label>
            <input type="text" id="newUsername" class="input-ctrl" placeholder="যেমন: user1">
          </div>
          <div>
            <label class="field-label">পাসওয়ার্ড (Password)*</label>
            <input type="text" id="newPassword" class="input-ctrl" placeholder="কমপক্ষে ৪ অক্ষর">
          </div>
          <div>
            <label class="field-label">ডিসপ্লে নাম (Display Name)</label>
            <input type="text" id="newDisplayName" class="input-ctrl" placeholder="যেমন: তানভীর">
          </div>
          <div>
            <label class="field-label">প্ল্যান (Assigned Plan)</label>
            <select id="newPlan" class="input-ctrl">
              <option value="free">ফ্রি প্ল্যান (Free)</option>
              <option value="pro">প্রো প্ল্যান (Pro)</option>
              <option value="enterprise">এন্টারপ্রাইজ (Enterprise)</option>
            </select>
          </div>
          <div>
            <label class="field-label">রোল (Role)</label>
            <select id="newRole" class="input-ctrl">
              <option value="user">ইউজার (Standard User)</option>
              <option value="admin">অ্যাডমিন (Admin)</option>
            </select>
          </div>
          <div style="display:flex; align-items:flex-end;">
            <button onclick="addNewUser()" class="btn-primary-action" style="height: 38px; width:100%;">➕ তৈরি করুন</button>
          </div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="user-table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>আইডি</th>
              <th>ইউজারনেম</th>
              <th>নাম</th>
              <th>প্ল্যান (Plan)</th>
              <th>WhatsApp নম্বর</th>
              <th>স্ট্যাটাস</th>
              <th>রোল</th>
              <th>Google Calendar</th>
              <th>অ্যাকশন</th>
            </tr>
          </thead>
          <tbody id="userTableBody">
            ${renderUserRowsHtml()}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Audit Logs Modal -->
    <div id="auditLogsModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:9999; backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:20px;">
      <div style="background:var(--card-bg); border:1px solid var(--card-border); border-radius:16px; width:100%; max-width:850px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 25px 50px rgba(0,0,0,0.8);">
        <div style="padding:18px 24px; border-bottom:1px solid var(--card-border); display:flex; justify-content:space-between; align-items:center;">
          <h3 style="color:#fff; font-size:16px; font-weight:700;">📜 সিকিউরিটি ও অ্যাডমিন অডিট লগ (Audit Trail)</h3>
          <button onclick="closeAuditLogsModal()" class="btn-ctrl btn-secondary" style="font-size:12px; padding:4px 10px;">✕ বন্ধ করুন</button>
        </div>
        <div style="padding:16px 24px; overflow-y:auto; flex:1;">
          <table class="user-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>আইডি</th>
                <th>সময়</th>
                <th>অ্যাক্টর</th>
                <th>টার্গেট</th>
                <th>অ্যাকশন</th>
                <th>ফলাফল</th>
                <th>মেটাডাটা</th>
              </tr>
            </thead>
            <tbody id="auditLogsBody">
              <tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">অডিট লগ লোড হচ্ছে...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Self-Healing & Diagnostic Logs Modal -->
    <div id="selfHealingModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:9999; backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:20px;">
      <div style="background:var(--card-bg); border:1px solid rgba(16, 185, 129, 0.3); border-radius:16px; width:100%; max-width:920px; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 25px 50px rgba(0,0,0,0.8);">
        <div style="padding:18px 24px; border-bottom:1px solid var(--card-border); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="color:#6ee7b7; font-size:16px; font-weight:700;">🩺 স্বয়ংক্রিয় ডায়াগনসিস ও সেলফ-হিলিং অডিট (Self-Healing Engine)</h3>
            <p style="color:var(--text-muted); font-size:12px; margin-top:2px;" id="selfHealingHealthSummary">সিস্টেম স্থিতি লোড হচ্ছে...</p>
          </div>
          <button onclick="closeSelfHealingModal()" class="btn-ctrl btn-secondary" style="font-size:12px; padding:4px 10px;">✕ বন্ধ করুন</button>
        </div>
        <div style="padding:16px 24px; overflow-y:auto; flex:1;">
          <table class="user-table" style="font-size:12px;">
            <thead>
              <tr>
                <th>Error ID</th>
                <th>সময়</th>
                <th>ক্যাটাগরি</th>
                <th>মূল কারণ (Root Cause)</th>
                <th>সংশোধন পদক্ষেপ (Corrective Action)</th>
                <th>স্ট্যাটাস</th>
              </tr>
            </thead>
            <tbody id="selfHealingBody">
              <tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">সেলফ-হিলিং লগ লোড হচ্ছে...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Evolution & Autonomous Self-Update Modal -->
    <div id="evolutionModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.78); z-index:9999; backdrop-filter:blur(6px); align-items:center; justify-content:center; padding:20px;">
      <div style="background:var(--card-bg); border:1px solid rgba(99, 102, 241, 0.35); border-radius:16px; width:100%; max-width:980px; max-height:88vh; display:flex; flex-direction:column; box-shadow:0 25px 50px rgba(0,0,0,0.85);">
        <div style="padding:18px 24px; border-bottom:1px solid var(--card-border); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="color:#a5b4fc; font-size:16px; font-weight:700;">🚀 স্বয়ংক্রিয় এআই সেলফ-আপডেট ও ইভোলিউশন হাব (Autonomous Evolution Engine)</h3>
            <p style="color:var(--text-muted); font-size:12px; margin-top:2px;" id="evolutionHeaderSummary">লোড হচ্ছে...</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button onclick="triggerEvolutionCycle()" class="btn-ctrl" style="font-size:11px; padding:5px 12px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff;">⚡ ইভোলিউশন সাইকেল চালান</button>
            <button onclick="closeEvolutionModal()" class="btn-ctrl btn-secondary" style="font-size:12px; padding:4px 10px;">✕ বন্ধ করুন</button>
          </div>
        </div>
        <div style="padding:16px 24px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:20px;">
          
          <!-- Feature Flags Panel -->
          <div>
            <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
              <span>🚩 সক্রিয় ফিচার ফ্ল্যাগ (Feature Flags & Kill-Switches):</span>
              <span style="font-size:11px; color:var(--text-muted);">সার্ভার রিস্টার্ট ছাড়া তাৎক্ষণিক অন/অফ</span>
            </div>
            <table class="user-table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>কী (Key)</th>
                  <th>নাম ও বিবরণ</th>
                  <th>ঝুঁকি স্তর</th>
                  <th>বর্তমান অবস্থা</th>
                  <th>অ্যাকশন</th>
                </tr>
              </thead>
              <tbody id="evolutionFlagsBody">
                <tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">ফিচার ফ্ল্যাগ লোড হচ্ছে...</td></tr>
              </tbody>
            </table>
          </div>

          <!-- Evolution History Panel -->
          <div>
            <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:8px;">📜 রিলিজ ও সেলফ-আপডেট হিস্ট্রি (Evolution Audit Trail):</div>
            <table class="user-table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>Change ID</th>
                  <th>সংস্করণ</th>
                  <th>কারণ (Reason)</th>
                  <th>ঝুঁকি</th>
                  <th>টেস্ট ফলাফল</th>
                  <th>স্ট্যাটাস</th>
                </tr>
              </thead>
              <tbody id="evolutionHistoryBody">
                <tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-muted);">হিস্ট্রি লোড হচ্ছে...</td></tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>

    <!-- Update User Password Modal -->
    <div id="updatePasswordModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:9999; backdrop-filter:blur(8px); align-items:center; justify-content:center; padding:20px;">
      <div style="background:var(--card-bg); border:1px solid rgba(234, 179, 8, 0.35); border-radius:18px; width:100%; max-width:480px; box-shadow:0 25px 60px rgba(0,0,0,0.85); overflow:hidden;">
        <div style="padding:18px 24px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; background:rgba(234, 179, 8, 0.08);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:22px;">🔑</span>
            <div>
              <h3 style="color:#fde047; font-size:16px; font-weight:700; margin:0;">ইউজার পাসওয়ার্ড আপডেট</h3>
              <p style="color:var(--text-muted); font-size:12px; margin:2px 0 0 0;" id="updatePwdUserLabel">ইউজার লোড হচ্ছে...</p>
            </div>
          </div>
          <button onclick="closeUpdatePasswordModal()" class="btn-ctrl btn-secondary" style="font-size:12px; padding:4px 10px;">✕</button>
        </div>
        <div style="padding:22px 24px;">
          <input type="hidden" id="updatePwdUserId" value="">
          <div style="margin-bottom:16px;">
            <label class="field-label" style="margin-bottom:6px; display:block;">নতুন পাসওয়ার্ড (New Password)*</label>
            <div style="position:relative;">
              <input type="password" id="modalNewPassword" class="input-ctrl" placeholder="কমপক্ষে ৩ অক্ষরের পাসওয়ার্ড" style="padding-right:40px; width:100%;">
              <button type="button" onclick="togglePwdVisibility('modalNewPassword', this)" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px;">👁️</button>
            </div>
          </div>
          <div style="margin-bottom:16px;">
            <label class="field-label" style="margin-bottom:6px; display:block;">পাসওয়ার্ড নিশ্চিত করুন (Confirm Password)*</label>
            <div style="position:relative;">
              <input type="password" id="modalConfirmPassword" class="input-ctrl" placeholder="পুনরায় নতুন পাসওয়ার্ড লিখুন" style="padding-right:40px; width:100%;">
              <button type="button" onclick="togglePwdVisibility('modalConfirmPassword', this)" style="position:absolute; right:10px; top:50%; transform:translateY(-50%); background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:14px;">👁️</button>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:10px 12px; font-size:12px; color:#9ca3af; margin-bottom:18px;">
            🛡️ <em>পাসওয়ার্ডটি scrypt অ্যালগরিদমে ক্রিপ্টোগ্রাফিকভাবে সুরক্ষিত হয়ে সংরক্ষিত হবে। WhatsApp বা ড্যাশবোর্ডে লগইন করার সময় এটি প্রযোজ্য হবে।</em>
          </div>
          <div id="updatePwdAlert" style="display:none; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:16px;"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button onclick="closeUpdatePasswordModal()" class="btn-ctrl btn-secondary" style="padding:8px 16px;">বাতিল</button>
            <button onclick="submitUpdatePassword()" id="btnSubmitPwd" class="btn-primary-action" style="background:#eab308; color:#0b0f19; font-weight:700; padding:8px 18px; border:none;">💾 পাসওয়ার্ড সংরক্ষণ</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Database Reset Danger Modal -->
    <div id="databaseResetModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); z-index:9999; backdrop-filter:blur(10px); align-items:center; justify-content:center; padding:20px;">
      <div style="background:var(--card-bg); border:1px solid rgba(239, 68, 68, 0.45); border-radius:18px; width:100%; max-width:540px; box-shadow:0 25px 70px rgba(239, 68, 68, 0.25); overflow:hidden;">
        <div style="padding:18px 24px; border-bottom:1px solid rgba(239, 68, 68, 0.2); display:flex; justify-content:space-between; align-items:center; background:rgba(239, 68, 68, 0.1);">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">⚠️</span>
            <div>
              <h3 style="color:#fca5a5; font-size:17px; font-weight:700; margin:0;">ডাটাবেস রিসেট কন্ট্রোল (Database Reset)</h3>
              <p style="color:#f87171; font-size:12px; margin:2px 0 0 0;">সাবধানতা: এটি অপরিবর্তনযোগ্য সিস্টেম অপারেশন</p>
            </div>
          </div>
          <button onclick="closeDatabaseResetModal()" class="btn-ctrl btn-secondary" style="font-size:12px; padding:4px 10px;">✕</button>
        </div>
        <div style="padding:22px 24px;">
          <div style="background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.25); border-radius:10px; padding:12px 16px; margin-bottom:18px; font-size:13px; line-height:1.6; color:#fecaca;">
            🚨 <strong>গুরুত্বপূর্ণ সতর্কতা:</strong> ডাটাবেস রিসেট করলে নির্বাচিত সকল ডাটা স্থায়ীভাবে মুছে যাবে।
          </div>

          <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:10px;">রিসেটের ধরন নির্বাচন করুন:</div>
          <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
            <label style="display:flex; align-items:flex-start; gap:10px; padding:12px 14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:10px; cursor:pointer;">
              <input type="radio" name="dbResetMode" value="data_only" checked style="margin-top:3px;">
              <div>
                <strong style="color:#fff; font-size:13px;">🧹 ক্লিন ডাটা রিসেট (Clean Operational Data)</strong>
                <p style="color:var(--text-muted); font-size:12px; margin:4px 0 0 0; line-height:1.5;">
                  মুছে যাবে: সকল রিমাইন্ডার, নোট, মেমোরি, ক্যালেন্ডার কিউ এবং সিস্টেম লগ।<br>
                  <span style="color:#86efac;">✅ সুরক্ষিত থাকবে: সকল নিবন্ধিত ইউজার অ্যাকাউন্ট ও পাসওয়ার্ড।</span>
                </p>
              </div>
            </label>
            <label style="display:flex; align-items:flex-start; gap:10px; padding:12px 14px; background:rgba(239, 68, 68, 0.05); border:1px solid rgba(239, 68, 68, 0.2); border-radius:10px; cursor:pointer;">
              <input type="radio" name="dbResetMode" value="full" style="margin-top:3px;">
              <div>
                <strong style="color:#fca5a5; font-size:13px;">💥 সম্পূর্ণ ফ্যাক্টরি রিসেট (Factory Reset)</strong>
                <p style="color:var(--text-muted); font-size:12px; margin:4px 0 0 0; line-height:1.5;">
                  মুছে যাবে: সকল ডাটা এবং কাস্টম ইউজার অ্যাকাউন্ট।<br>
                  <span style="color:#fcd34d;">👑 রিস্টোর হবে: ডিফল্ট অ্যাডমিন একাউন্ট (admin / 123)।</span>
                </p>
              </div>
            </label>
          </div>

          <div style="margin-bottom:18px;">
            <label class="field-label" style="color:#fca5a5; margin-bottom:6px; display:block;">নিশ্চিত করতে নিচে <strong>RESET</strong> লিখুন:</label>
            <input type="text" id="dbResetConfirmInput" class="input-ctrl" placeholder="RESET" style="text-align:center; font-weight:700; letter-spacing:2px; color:#ef4444; border-color:rgba(239,68,68,0.4); text-transform:uppercase;">
          </div>

          <div id="dbResetAlert" style="display:none; padding:10px 14px; border-radius:8px; font-size:12px; margin-bottom:16px;"></div>

          <div style="display:flex; justify-content:flex-end; gap:10px;">
            <button onclick="closeDatabaseResetModal()" class="btn-ctrl btn-secondary" style="padding:8px 16px;">বাতিল</button>
            <button onclick="submitDatabaseReset()" id="btnSubmitReset" class="btn-ctrl btn-danger" style="padding:8px 20px; font-weight:700; background:#dc2626; border-color:#ef4444;">💥 নিশ্চিত রিসেট করুন</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Multi-AI Engine & API Management Card -->
    <div class="section-card" id="aiConfigCard">
      <div class="card-title">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span>🤖 মাল্টি-এআই মডেল ও এপিআই সেটিংস (AI Engine Hub)</span>
          <span class="badge active" style="font-size: 11px;">⚡ লাইভ সুইচিং</span>
        </div>
        <button onclick="loadAiSettings()" class="btn-ctrl btn-secondary" style="font-size: 11px; padding: 5px 10px;">🔄 রিলোড সেটিংস</button>
      </div>
      <p style="color: var(--text-muted); font-size: 13px; line-height: 1.6; margin-top: 4px;">
        Google Gemini, OpenAI ChatGPT অথবা সম্পূর্ণ লোকাল অফলাইন এআই ইঞ্জিন ব্যবহার করুন। রিয়েলটাইমে API কী পরিবর্তন ও কানেকশন টেস্ট করা যাবে।
      </p>

      <div class="ai-config-grid">
        <!-- Active Provider Selection -->
        <div class="ai-box">
          <label class="field-label" style="font-size: 13px; color: #fff;">🎯 সক্রিয় এআই ইঞ্জিন (Active Engine)</label>
          <select id="activeAiProvider" class="input-ctrl" onchange="onAiProviderChange()" style="padding: 10px; font-weight: 600;">
            <option value="gemini">Google Gemini (রেকমেন্ডেড · সুপার ফাস্ট)</option>
            <option value="openai">OpenAI ChatGPT (GPT-4o / GPT-4o-mini)</option>
            <option value="local">লোকাল অফলাইন এআই (100% অফলাইন · নো API Key)</option>
          </select>
          <div style="margin-top: 12px; font-size: 12px; color: var(--text-muted); line-height: 1.5;" id="providerDesc">
            ⚡ Gemini 3.5 Flash Lite মডেল ব্যবহার করে মাত্র ~900ms এ যেকোনো জটিল বাংলা নির্দেশ প্রসেস করা যায়।
          </div>
        </div>

        <!-- Google Gemini Settings -->
        <div class="ai-box" id="geminiBox">
          <div style="font-size: 13px; font-weight: 700; color: #60a5fa; margin-bottom: 8px;">🌐 Google Gemini কনফিগারেশন</div>
          <div style="margin-bottom: 10px;">
            <label class="field-label">Gemini API Key</label>
            <div style="display: flex; gap: 6px;">
              <input type="password" id="geminiApiKey" class="input-ctrl" placeholder="AIzaSy...">
              <button onclick="togglePasswordVisibility('geminiApiKey')" class="btn-ctrl btn-secondary" style="padding: 6px 10px;">👁️</button>
            </div>
          </div>
          <div>
            <label class="field-label">Gemini মডেল</label>
            <select id="geminiModel" class="input-ctrl">
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (অত্যন্ত দ্রুত ~900ms, রেকমেন্ডেড)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (স্ট্যান্ডার্ড)</option>
              <option value="gemini-3.8-flash">gemini-3.8-flash (উন্নত ভার্সন)</option>
            </select>
          </div>
        </div>

        <!-- OpenAI Settings -->
        <div class="ai-box" id="openaiBox">
          <div style="font-size: 13px; font-weight: 700; color: #34d399; margin-bottom: 8px;">🧠 OpenAI (ChatGPT) কনফিগারেশন</div>
          <div style="margin-bottom: 10px;">
            <label class="field-label">OpenAI API Key</label>
            <div style="display: flex; gap: 6px;">
              <input type="password" id="openaiApiKey" class="input-ctrl" placeholder="sk-...">
              <button onclick="togglePasswordVisibility('openaiApiKey')" class="btn-ctrl btn-secondary" style="padding: 6px 10px;">👁️</button>
            </div>
          </div>
          <div>
            <label class="field-label">OpenAI মডেল</label>
            <select id="openaiModel" class="input-ctrl">
              <option value="gpt-4o-mini">gpt-4o-mini (ফাস্ট ও সাশ্রয়ী)</option>
              <option value="gpt-4o">gpt-4o (সর্বোচ্চ বুদ্ধিমত্তা)</option>
              <option value="gpt-3.5-turbo">gpt-3.5-turbo (লেগ্যাসি)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Action Buttons & Test Result -->
      <div style="display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap;">
        <button onclick="saveAiSettings()" class="btn-primary-action">💾 সেটিংস সংরক্ষণ করুন</button>
        <button onclick="testAiConnection()" class="btn-ctrl btn-secondary" style="padding: 10px 18px; font-weight: 600;">⚡ কানেকশন টেস্ট করুন</button>
      </div>

      <div id="aiTestResultBox" class="ai-test-badge"></div>
    </div>

    <!-- Main Grid -->
    <div class="grid">
      <!-- Card 1: Gamification Hub -->
      <div class="card">
        <div class="card-title">
          <span>🎮 গ্যামিফিকেশন ও প্রোফাইল</span>
          <span style="color: var(--gold); font-size: 13px;">লেভেল ${profile.level}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
          <span>মোট স্কোর: <strong>${profile.points} XP</strong></span>
          <span>পরবর্তী লেভেল: <strong>${profile.progress.percent}%</strong></span>
        </div>
        <div class="xp-bar-container">
          <div class="xp-bar-fill" style="width: ${profile.progress.percent}%;"></div>
        </div>
        <div class="gamify-stats">
          <div class="stat-box">
            <div class="stat-val">🔥 ${profile.streak_days}</div>
            <div class="stat-label">দিনের স্ট্রিক</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">✅ ${profile.tasks_completed}</div>
            <div class="stat-label">সম্পন্ন কাজ</div>
          </div>
          <div class="stat-box">
            <div class="stat-val">🏆 ${profile.badges.length}</div>
            <div class="stat-label">ব্যাজ অর্জিত</div>
          </div>
        </div>
        <div style="margin-top: 16px;">
          <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">অর্জিত ব্যাজসমূহ:</div>
          <div class="badges-row">
            ${profile.badges.length > 0
              ? profile.badges.map(b => `<span class="badge-chip">${b.badge_icon} ${b.badge_name}</span>`).join('')
              : '<span style="font-size: 12px; color: var(--text-muted);">কাজ সম্পন্ন করে প্রথম ব্যাজ আনলক করো!</span>'
            }
          </div>
        </div>
      </div>

      <!-- Card 2: Interactive Calendar -->
      <div class="card">
        <div class="card-title">
          <span>📅 ক্যালেন্ডার ভিউ</span>
          <span style="font-size: 12px; color: var(--text-muted);" id="curMonthName">চলতি মাস</span>
        </div>
        <div id="calendarContainer">
          <!-- Calendar rendered via JS -->
        </div>
      </div>
    </div>

    <!-- Reminders & Tasks Section -->
    <div class="grid">
      <div class="card" style="grid-column: 1 / -1;">
        <div class="card-title">
          <span>⏰ সক্রিয় রিমাইন্ডার ও কাজসমূহ</span>
          <span style="font-size: 12px; color: var(--text-muted);">যেকোনো ডিভাইস থেকে "Done" করলেই XP যোগ হবে</span>
        </div>
        <div id="remindersList">
          <p style="color: var(--text-muted);">লোড হচ্ছে...</p>
        </div>
        <div class="add-input-box">
          <input type="text" id="newTaskInput" placeholder="নতুন কাজ বা রিমাইন্ডার লেখো (যেমন: ওষুধ খাওয়া, প্রজেক্ট মিটিং)...">
          <button onclick="addNewReminder()">+ যোগ করো</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    async function loadData() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        renderReminders(data.reminders);
        renderCalendar(data.reminders);
      } catch (e) {
        console.error(e);
      }
    }

    function renderReminders(reminders) {
      const container = document.getElementById('remindersList');
      if (!reminders || reminders.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); padding: 10px;">কোনো সক্রিয় রিমাইন্ডার নেই। নিচে নতুন যোগ করতে পারো!</p>';
        return;
      }
      container.innerHTML = reminders.map(r => {
        const time = new Date(r.remind_at).toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
        return \`
          <div class="reminder-item" id="rem-\${r.id}">
            <div>
              <div class="reminder-text">📌 \${r.content}</div>
              <div class="reminder-time">⏰ \${time} · #\${r.id}</div>
            </div>
            <button class="btn-done" onclick="completeReminder(\${r.id}, '\${encodeURIComponent(r.content)}')">✓ সম্পন্ন (+15 XP)</button>
          </div>
        \`;
      }).join('');
    }

    function renderCalendar(reminders) {
      const container = document.getElementById('calendarContainer');
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const firstDay = new Date(year, month, 1).getDay();

      const eventDays = new Set(reminders.map(r => new Date(r.remind_at).getDate()));

      const days = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'];
      let html = '<table class="calendar-widget"><thead><tr>';
      days.forEach(d => html += \`<th>\${d}</th>\`);
      html += '</tr></thead><tbody><tr>';

      for (let i = 0; i < firstDay; i++) {
        html += '<td></td>';
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === now.getDate();
        const hasEvent = eventDays.has(day);
        const classes = [isToday ? 'today' : '', hasEvent ? 'has-event' : ''].filter(Boolean).join(' ');
        html += \`<td class="\${classes}">\${day}</td>\`;
        if ((firstDay + day) % 7 === 0 && day !== daysInMonth) {
          html += '</tr><tr>';
        }
      }
      html += '</tr></tbody></table>';
      container.innerHTML = html;
    }

    async function completeReminder(id, encodedContent) {
      const content = decodeURIComponent(encodedContent);
      const res = await fetch('/api/complete-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderId: id, taskText: content })
      });
      const result = await res.json();
      if (result.success) {
        alert(\`🎉 কাজ সম্পন্ন! +\${result.pointsAwarded} XP অর্জিত হয়েছে!\\nবর্তমান স্কোর: \${result.totalPoints} XP (Level \${result.level})\`);
        location.reload();
      }
    }

    async function addNewReminder() {
      const input = document.getElementById('newTaskInput');
      const text = input.value.trim();
      if (!text) return;
      await fetch('/api/add-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      input.value = '';
      loadData();
    }

    // ── Live WhatsApp Bot Status & QR Polling ──
    async function fetchBotStatus() {
      try {
        const res = await fetch('/api/bot/status');
        const data = await res.json();
        const dot = document.getElementById('botStatusDot');
        const text = document.getElementById('botStatusText');
        const connectedState = document.getElementById('waConnectedState');
        const qrState = document.getElementById('waQrState');
        const btnLogout = document.getElementById('btnLogout');
        const qrImg = document.getElementById('dashboardQrImg');
        const qrSpinner = document.getElementById('qrLoadingSpinner');
        const headerBadge = document.getElementById('headerWaBadge');

        if (data.status === 'CONNECTED') {
          dot.className = 'live-dot online';
          text.innerText = 'অনলাইনে সংযুক্ত';
          connectedState.style.display = 'block';
          qrState.style.display = 'none';
          btnLogout.style.display = 'inline-block';
          if (headerBadge) {
            headerBadge.className = 'badge active';
            headerBadge.innerText = '🟢 WhatsApp সংযুক্ত';
          }
          document.getElementById('waUserPhone').innerText = data.userPhone || 'সক্রিয়';
          document.getElementById('waUserName').innerText = data.userName ? ('(' + data.userName + ')') : '';
          if (data.connectedAt) {
            document.getElementById('waConnectedTime').innerText = '· কানেক্টেড: ' + new Date(data.connectedAt).toLocaleTimeString('bn-BD');
          }
        } else if (data.status === 'WAITING_FOR_QR' && data.qrImage) {
          dot.className = 'live-dot waiting';
          text.innerText = 'স্ক্যানের অপেক্ষায়...';
          connectedState.style.display = 'none';
          qrState.style.display = 'block';
          btnLogout.style.display = 'none';
          if (headerBadge) {
            headerBadge.className = 'badge';
            headerBadge.innerText = '🟡 QR স্ক্যান বাকি';
          }
          qrImg.src = data.qrImage;
          qrImg.style.display = 'block';
          qrSpinner.style.display = 'none';
        } else {
          dot.className = 'live-dot offline';
          text.innerText = 'শুরু হচ্ছে...';
          connectedState.style.display = 'none';
          qrState.style.display = 'block';
          btnLogout.style.display = 'none';
          qrImg.style.display = 'none';
          qrSpinner.style.display = 'block';
        }

        const pairBox = document.getElementById('pairingCodeDisplay');
        const pairText = document.getElementById('pairingCodeText');
        if (data.pairingCode && pairBox && pairText) {
          pairBox.style.display = 'block';
          pairText.innerText = data.pairingCode;
        }
      } catch (e) {}
    }

    async function triggerBotRestart() {
      if (!confirm('বটটি কি রিস্টার্ট করতে চান?')) return;
      try {
        const res = await fetch('/api/bot/restart', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'বট রিস্টার্ট হচ্ছে...');
        setTimeout(fetchBotStatus, 1500);
      } catch (e) {
        alert('রিস্টার্ট কমান্ড ব্যর্থ: ' + e.message);
      }
    }

    async function triggerClearSession() {
      if (!confirm('সেশন ও পুরোনো ক্যাশ পরিষ্কার করে ফ্রেশ নতুন QR কোড আনতে চান?')) return;
      try {
        const res = await fetch('/api/bot/clear-session', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'সেশন রিসেট হচ্ছে...');
        setTimeout(fetchBotStatus, 2000);
      } catch (e) {
        alert('রিসেট কমান্ড ব্যর্থ: ' + e.message);
      }
    }

    async function requestPairingCodeUI() {
      const input = document.getElementById('pairingPhoneInput');
      const phone = input.value.trim().replace(/\D/g, '');
      if (!phone || phone.length < 10) {
        alert('অনুগ্রহ করে সঠিক ফোন নম্বর দিন (যেমন: 8801XXXXXXXXX)');
        return;
      }
      try {
        const btn = event.target;
        btn.disabled = true;
        btn.innerText = '⏳ কোড আসছে...';
        const res = await fetch('/api/bot/request-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phoneNumber: phone })
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerText = '🔑 কোড পান';
        if (data.success && data.code) {
          const pairBox = document.getElementById('pairingCodeDisplay');
          const pairText = document.getElementById('pairingCodeText');
          if (pairBox && pairText) {
            pairBox.style.display = 'block';
            pairText.innerText = data.code;
          }
          alert('✅ পেয়ারিং কোড তৈরি হয়েছে: ' + data.code + '\\n\\nআপনার ফোনের WhatsApp ➔ Linked Devices ➔ Link with phone number instead-এ কোডটি লিখুন!');
        } else {
          alert('❌ ব্যর্থ: ' + (data.error || 'কোড পাওয়া যায়নি'));
        }
      } catch (e) {
        alert('এরর: ' + e.message);
      }
    }

    async function triggerBotLogout() {
      if (!confirm('আপনি কি WhatsApp সংযোগ বিচ্ছিন্ন করতে চান?')) return;
      try {
        const res = await fetch('/api/bot/logout', { method: 'POST' });
        const data = await res.json();
        alert(data.message || 'সংযোগ বিচ্ছিন্ন করা হয়েছে।');
        setTimeout(fetchBotStatus, 1500);
      } catch (e) {
        alert('ডিসকানেক্ট ব্যর্থ: ' + e.message);
      }
    }

    // ── Live WhatsApp Chat Stream Polling ──
    async function fetchLiveChats() {
      try {
        const res = await fetch('/api/live-chat');
        const data = await res.json();
        if (data.success && data.logs) {
          renderChatLogs(data.logs);
        }
      } catch (e) {}
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .split('&').join('&amp;')
        .split('<').join('&lt;')
        .split('>').join('&gt;')
        .split('"').join('&quot;')
        .split(String.fromCharCode(10)).join('<br>')
        .split(String.fromCharCode(13)).join('');
    }

    function formatBotMarkdown(str) {
      if (!str) return '';
      var s = escapeHtml(str);
      var boldPattern = new RegExp('\\\\*([^*]+)\\\\*', 'g');
      var italicPattern = new RegExp('_([^_]+)_', 'g');
      return s.replace(boldPattern, '<strong>$1</strong>').replace(italicPattern, '<em>$1</em>');
    }

    function renderChatLogs(logs) {
      const container = document.getElementById('chatStreamBox');
      if (!container) return;
      if (!logs || logs.length === 0) {
        container.innerHTML = \`
          <div style="text-align: center; color: var(--text-muted); padding: 35px 20px;">
            <div style="font-size: 32px; margin-bottom: 8px;">💬</div>
            <div style="font-weight: 600; color: #fff; margin-bottom: 4px;">এখনো কোনো মেসেজ আদান-প্রদান হয়নি</div>
            <div style="font-size: 12px; line-height: 1.6; max-width: 480px; margin: 0 auto;">
              আপনার ফোনে WhatsApp খুলে <strong>Message yourself (নিজের সাথে চ্যাট)</strong>-এ মেসেজ পাঠান (যেমন: <em>"Hello"</em> বা <em>"কাল সকাল ১০টায় মিটিং"</em>)। সাথে সাথে এখানে লাইভ দেখতে পাবেন!
            </div>
          </div>
        \`;
        return;
      }

      container.innerHTML = logs.map(l => {
        const userText = escapeHtml(l.incoming);
        const botReply = formatBotMarkdown(l.reply);
        return \`
          <div class="chat-item">
            <div class="bubble-user">
              <div class="meta">
                <span>👤 \${escapeHtml(l.user)}</span>
                <span>\${l.time}</span>
              </div>
              <div>\${userText}</div>
            </div>
            \${botReply ? \`
              <div class="bubble-bot">
                <div class="meta">
                  <span>🤖 FREND Assistant</span>
                  <span>\${l.time}</span>
                </div>
                <div>\${botReply}</div>
              </div>
            \` : ''}
          </div>
        \`;
      }).join('');
    }

    async function sendTestChatMessage() {
      const input = document.getElementById('testChatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      try {
        const res = await fetch('/api/test-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        fetchLiveChats();
      } catch (e) {
        alert('টেস্ট মেসেজ পাঠাতে সমস্যা: ' + e.message);
      }
    }

    async function clearLiveChatLogsUI() {
      if (!confirm('লাইভ চ্যাট লগ কি পরিষ্কার করতে চান?')) return;
      try {
        await fetch('/api/live-chat/clear', { method: 'POST' });
        fetchLiveChats();
      } catch (e) {}
    }

    // ── Multi-User Management & RBAC Functions ──
    async function loadUsers() {
      try {
        const res = await fetch('/api/users');
        const data = await res.json();
        const tbody = document.getElementById('userTableBody');
        if (!data || !data.success || !Array.isArray(data.users)) {
          console.warn('loadUsers: API request unsuccessful');
          return;
        }
        if (data.users.length === 0) {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:20px;">কোনো ইউজার পাওয়া যায়নি। উপরে নতুন ইউজার যোগ করুন।</td></tr>';
          return;
        }
        tbody.innerHTML = data.users.map(u => {
          const isBound = !!u.bound_phone;
          const phoneBadge = isBound
            ? ('<span class="status-badge active">📱 ' + escapeHtml(u.bound_phone) + '</span>')
            : '<span class="status-badge unbound">⚪ আনবাইন্ড</span>';
          const statusBadge = (u.status === 'active')
            ? '<span class="status-badge active">🟢 সক্রিয়</span>'
            : '<span class="status-badge blocked">🔴 নিষ্ক্রিয়</span>';
          const roleBadge = u.role === 'admin'
            ? '<span class="status-badge admin">👑 Admin</span>'
            : '<span class="status-badge unbound">👤 User</span>';
          
          const planSelect = '<select onchange="changeUserPlan(' + u.id + ', this.value)" style="background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.15); color:#c7d2fe; border-radius:6px; padding:3px 8px; font-size:11px;">' +
            '<option value="free"' + (u.assigned_plan_id === 'free' ? ' selected' : '') + '>Free</option>' +
            '<option value="pro"' + (u.assigned_plan_id === 'pro' ? ' selected' : '') + '>Pro</option>' +
            '<option value="enterprise"' + (u.assigned_plan_id === 'enterprise' ? ' selected' : '') + '>Enterprise</option>' +
          '</select>';

          const statusBtn = (u.status === 'active')
            ? ('<button onclick="disableUser(' + u.id + ')" class="btn-table-action" style="background:rgba(239,68,68,0.2); color:#fca5a5;" title="অ্যাকাউন্ট সাময়িকভাবে বন্ধ করুন">⛔ Disable</button>')
            : ('<button onclick="enableUser(' + u.id + ')" class="btn-table-action" style="background:rgba(34,197,94,0.2); color:#86efac;" title="অ্যাকাউন্ট সক্রিয় করুন">✅ Enable</button>');

          const calBtn = '<a href="/oauth2/google/connect?userId=' + u.id + '" target="_blank" class="btn-table-action" style="background:rgba(99,102,241,0.2); color:#c7d2fe; text-decoration:none;" title="এই ইউজারের Google Calendar কানেক্ট করুন">🔗 Connect</a>';

          const unbindBtn = isBound
            ? ('<button onclick="unbindUserPhone(' + u.id + ')" class="btn-table-action unbind" title="WhatsApp নম্বর ডিসকানেক্ট">🔌 আনবাইন্ড</button>')
            : '';

          const pwdBtn = '<button onclick="openUpdatePasswordModal(' + u.id + ', \'' + escapeHtml(u.username) + '\')" class="btn-table-action" style="background:rgba(234,179,8,0.2); color:#fde047;" title="পাসওয়ার্ড আপডেট করুন">🔑 পাসওয়ার্ড</button>';
          
          return '<tr id="user-row-' + u.id + '">' +
            '<td style="color:var(--text-muted); font-weight:600;">#' + u.id + '</td>' +
            '<td><strong style="color:#60a5fa;">' + escapeHtml(u.username) + '</strong></td>' +
            '<td>' + escapeHtml(u.display_name || '-') + '</td>' +
            '<td>' + planSelect + '</td>' +
            '<td>' + phoneBadge + '</td>' +
            '<td>' + statusBadge + '</td>' +
            '<td>' + roleBadge + '</td>' +
            '<td>' + calBtn + '</td>' +
            '<td>' +
              statusBtn +
              pwdBtn +
              unbindBtn +
              '<button onclick="deleteUser(' + u.id + ')" class="btn-table-action del">🗑️ মুছুন</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        console.error('loadUsers error:', err);
      }
    }

    function disableUser(id) { toggleUserStatus(id, 'disabled'); }
    function enableUser(id) { toggleUserStatus(id, 'active'); }

    async function toggleUserStatus(id, newStatus) {
      let reason = '';
      if (newStatus === 'disabled') {
        reason = prompt('অ্যাকাউন্ট বন্ধ করার কারণ লিখুন (ঐচ্ছিক):') || 'Administrative action';
      }
      try {
        const res = await fetch('/api/users/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: newStatus, reason })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function changeUserPlan(id, planId) {
      try {
        const res = await fetch('/api/users/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, planId })
        });
        const data = await res.json();
        if (data.success) {
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function openAuditLogsModal() {
      const modal = document.getElementById('auditLogsModal');
      const body = document.getElementById('auditLogsBody');
      if (modal) modal.style.display = 'flex';
      if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">অডিট লগ লোড হচ্ছে...</td></tr>';
      try {
        const res = await fetch('/api/admin/audit-logs');
        const data = await res.json();
        if (data.success && data.logs && data.logs.length > 0) {
          body.innerHTML = data.logs.map(l => {
            const dateStr = new Date(l.timestamp).toLocaleString('bn-BD');
            const resultColor = l.result === 'SUCCESS' ? '#86efac' : '#fca5a5';
            return '<tr>' +
              '<td>#' + l.id + '</td>' +
              '<td style="white-space:nowrap;">' + dateStr + '</td>' +
              '<td><code style="color:#93c5fd;">' + escapeHtml(l.actor_user_id) + '</code></td>' +
              '<td><code style="color:#cbd5e1;">' + escapeHtml(l.target_user_id) + '</code></td>' +
              '<td><strong>' + escapeHtml(l.action) + '</strong></td>' +
              '<td><span style="color:' + resultColor + '; font-weight:700;">' + l.result + '</span></td>' +
              '<td style="font-family:monospace; color:#94a3b8; max-width:200px; overflow:hidden; text-overflow:ellipsis;">' + escapeHtml(l.metadata || '{}') + '</td>' +
            '</tr>';
          }).join('');
        } else {
          body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:var(--text-muted);">এখনো কোনো অডিট লগ রেকর্ড নেই।</td></tr>';
        }
      } catch (err) {
        if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#fca5a5;">এরর: ' + escapeHtml(err.message) + '</td></tr>';
      }
    }

    function closeAuditLogsModal() {
      const modal = document.getElementById('auditLogsModal');
      if (modal) modal.style.display = 'none';
    }

    async function openSelfHealingModal() {
      const modal = document.getElementById('selfHealingModal');
      const body = document.getElementById('selfHealingBody');
      const healthSummary = document.getElementById('selfHealingHealthSummary');
      if (modal) modal.style.display = 'flex';
      if (body) body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">সেলফ-হিলিং অডিট লগ লোড হচ্ছে...</td></tr>';
      try {
        const [logsRes, healthRes] = await Promise.all([
          fetch('/api/admin/self-healing/logs'),
          fetch('/api/admin/self-healing/health')
        ]);
        const logsData = await logsRes.json();
        const healthData = await healthRes.json();

        if (healthSummary && healthData.success && healthData.health) {
          const h = healthData.health;
          healthSummary.innerHTML = '🟢 স্ট্যাটাস: <strong>' + h.status + '</strong> | ডাটাবেজ: <strong>' + h.database + '</strong> | স্বয়ংক্রিয় আরোগ্য (Healed): <strong>' + (h.stats ? h.stats.healed : 0) + 'টি</strong> | সাফল্যের হার: <strong>' + (h.stats ? h.stats.selfRepairRate : 100) + '%</strong>';
        }

        if (logsData.success && logsData.logs && logsData.logs.length > 0) {
          body.innerHTML = logsData.logs.map(l => {
            const dateStr = new Date(l.created_at).toLocaleString('bn-BD');
            const statusBadge = (l.status === 'HEALED' || l.status === 'RECOVERED')
              ? '<span class="status-badge active" style="font-size:11px;">✅ ' + l.status + '</span>'
              : (l.status === 'MISSING_DATA'
                ? '<span class="status-badge unbound" style="font-size:11px;">📭 MISSING_DATA</span>'
                : '<span class="status-badge blocked" style="font-size:11px;">⚠️ ' + l.status + '</span>');

            return '<tr>' +
              '<td><code style="color:#6ee7b7; font-size:11px;">' + escapeHtml(l.error_id) + '</code></td>' +
              '<td style="white-space:nowrap; font-size:11px;">' + dateStr + '</td>' +
              '<td><span style="background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:10px; color:#93c5fd;">' + escapeHtml(l.category) + '</span></td>' +
              '<td style="color:#fcd34d; max-width:200px; font-size:11px;">' + escapeHtml(l.root_cause || '-') + '</td>' +
              '<td style="color:#cbd5e1; max-width:240px; font-size:11px;">' + escapeHtml(l.corrective_action || '-') + '</td>' +
              '<td>' + statusBadge + '</td>' +
            '</tr>';
          }).join('');
        } else {
          body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:var(--text-muted);">এখনো কোনো ডায়াগনস্টিক লগ রেকর্ড নেই (সিস্টেম নিখুঁতভাবে চলছে)।</td></tr>';
        }
      } catch (err) {
        if (body) body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#fca5a5;">এরর: ' + escapeHtml(err.message) + '</td></tr>';
      }
    }

    function closeSelfHealingModal() {
      const modal = document.getElementById('selfHealingModal');
      if (modal) modal.style.display = 'none';
    }

    async function openEvolutionModal() {
      const modal = document.getElementById('evolutionModal');
      const flagsBody = document.getElementById('evolutionFlagsBody');
      const historyBody = document.getElementById('evolutionHistoryBody');
      const headerSummary = document.getElementById('evolutionHeaderSummary');
      if (modal) modal.style.display = 'flex';
      if (flagsBody) flagsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:var(--text-muted);">ফিচার ফ্ল্যাগ লোড হচ্ছে...</td></tr>';
      if (historyBody) historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-muted);">রিলিজ হিস্ট্রি লোড হচ্ছে...</td></tr>';

      try {
        const res = await fetch('/api/admin/evolution/status');
        const data = await res.json();
        if (data && headerSummary) {
          headerSummary.innerHTML = '🟢 রানিং ভার্সন: <strong>v' + data.currentVersion + '</strong> | লাস্ট ভেরিফাইড হেলদি: <strong>v' + data.lastKnownGoodVersion + '</strong> | মোট রিলিজ: <strong>' + data.totalReleases + 'টি</strong> | অটো-রোলব্যাক: <strong>' + data.automaticRollbacks + 'টি</strong>';
        }

        if (flagsBody && data.featureFlags) {
          flagsBody.innerHTML = data.featureFlags.map(f => {
            const badge = f.enabled
              ? '<span class="status-badge active" style="font-size:11px;">সক্রিয় (Active)</span>'
              : '<span class="status-badge blocked" style="font-size:11px;">নিষ্ক্রিয় (Off)</span>';
            const btnText = f.enabled ? 'অফ করুন' : 'অন করুন';
            const btnStyle = f.enabled ? 'background:rgba(239,68,68,0.2); color:#fca5a5;' : 'background:rgba(16,185,129,0.2); color:#6ee7b7;';
            return '<tr>' +
              '<td><code style="color:#a5b4fc; font-size:11px;">' + escapeHtml(f.key) + '</code></td>' +
              '<td><strong>' + escapeHtml(f.name) + '</strong><br><span style="font-size:11px; color:var(--text-muted);">' + escapeHtml(f.description || '') + '</span></td>' +
              '<td><span style="background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:10px;">' + escapeHtml(f.risk_level) + '</span></td>' +
              '<td>' + badge + '</td>' +
              '<td><button onclick="toggleFeatureFlag(this.dataset.flag)" data-flag="' + escapeHtml(f.key) + '" class="btn-ctrl" style="font-size:11px; padding:3px 8px; ' + btnStyle + '">' + btnText + '</button></td>' +
            '</tr>';
          }).join('');
        }

        if (historyBody && data.history && data.history.length > 0) {
          historyBody.innerHTML = data.history.map(h => {
            const statusBadge = h.status === 'DEPLOYED'
              ? '<span class="status-badge active" style="font-size:11px;">✅ DEPLOYED</span>'
              : (h.status === 'ROLLED_BACK'
                ? '<span class="status-badge blocked" style="font-size:11px;">↺ ROLLED_BACK</span>'
                : '<span class="status-badge unbound" style="font-size:11px;">' + h.status + '</span>');
            return '<tr>' +
              '<td><code style="color:#6ee7b7; font-size:11px;">' + escapeHtml(h.change_id) + '</code></td>' +
              '<td><span style="color:#93c5fd; font-size:11px;">v' + escapeHtml(h.version_to) + '</span></td>' +
              '<td style="color:#cbd5e1; font-size:11px; max-width:220px;">' + escapeHtml(h.reason) + '</td>' +
              '<td><span style="font-size:10px; color:#fcd34d;">' + escapeHtml(h.risk_level) + '</span></td>' +
              '<td><span style="font-size:11px; color:' + (h.test_results === 'PASSED' ? '#6ee7b7' : '#fca5a5') + ';">' + escapeHtml(h.test_results) + '</span></td>' +
              '<td>' + statusBadge + '</td>' +
            '</tr>';
          }).join('');
        } else if (historyBody) {
          historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:15px; color:var(--text-muted);">এখনো কোনো রিলিজ হিস্ট্রি রেকর্ড নেই।</td></tr>';
        }
      } catch (err) {
        if (flagsBody) flagsBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:15px; color:#fca5a5;">এরর: ' + escapeHtml(err.message) + '</td></tr>';
      }
    }

    function closeEvolutionModal() {
      const modal = document.getElementById('evolutionModal');
      if (modal) modal.style.display = 'none';
    }

    async function toggleFeatureFlag(flagKey) {
      try {
        const res = await fetch('/api/admin/evolution/flags/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: flagKey })
        });
        const data = await res.json();
        if (data.success) {
          openEvolutionModal();
        } else {
          alert('ত্রুটি: ' + (data.error || 'ফ্ল্যাগ আপডেট ব্যর্থ'));
        }
      } catch (err) {
        alert('নেটওয়ার্ক এরর: ' + err.message);
      }
    }

    async function triggerEvolutionCycle() {
      if (!confirm('আপনি কি স্বয়ংক্রিয় এআই ইভোলিউশন ও রিগ্রেশন টেস্ট সাইকেল চালাতে চান?')) return;
      try {
        const res = await fetch('/api/admin/evolution/run-cycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Manual Admin Triggered Self-Update' })
        });
        const data = await res.json();
        alert(data.message || (data.success ? 'ইভোলিউশন সাইকেল সফলভাবে সম্পন্ন!' : 'ব্যর্থ'));
        openEvolutionModal();
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function addNewUser() {
      const usernameInput = document.getElementById('newUsername');
      const passwordInput = document.getElementById('newPassword');
      const displayNameInput = document.getElementById('newDisplayName');
      const planInput = document.getElementById('newPlan');
      const roleInput = document.getElementById('newRole');

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      const displayName = displayNameInput.value.trim();
      const planId = planInput ? planInput.value : 'free';
      const role = roleInput.value;

      if (!username || !password) {
        alert('অনুগ্রহ করে ইউজারনেম এবং পাসওয়ার্ড উভয়ই পূরণ করুন!');
        return;
      }

      try {
        const res = await fetch('/api/users/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, displayName, role, planId })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
          usernameInput.value = '';
          passwordInput.value = '';
          displayNameInput.value = '';
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function unbindUserPhone(id) {
      if (!confirm('আপনি কি এই ইউজারের (ID #' + id + ') সংযুক্ত WhatsApp নম্বর আনবাইন্ড করতে চান?\\nআনবাইন্ড করলে ব্যবহারকারীকে আবার পাসওয়ার্ড দিয়ে নতুন নম্বর বাইন্ড করতে হবে।')) return;
      try {
        const res = await fetch('/api/users/unbind', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function deleteUser(id) {
      if (!confirm('আপনি কি সত্যিই ইউজার #' + id + ' মুছে ফেলতে চান?')) return;
      try {
        const res = await fetch('/api/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function editUserPrompt(id, username, oldPass, oldName, oldStatus, oldRole) {
      const newPass = prompt(\`"\${username}" এর নতুন পাসওয়ার্ড লিখুন (বর্তমান: \${oldPass}):\`, oldPass);
      if (newPass === null) return;
      const newName = prompt(\`"\${username}" এর নতুন ডিসপ্লে নাম লিখুন (বর্তমান: \${oldName}):\`, oldName);
      if (newName === null) return;
      const newStatus = confirm('স্ট্যাটাস "সক্রিয় (Active)" রাখতে OK চাপুন, "ব্লক (Blocked)" করতে Cancel চাপুন।') ? 'active' : 'blocked';

      try {
        const res = await fetch('/api/users/edit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            password: newPass || oldPass,
            displayName: newName !== null ? newName : oldName,
            status: newStatus,
            role: oldRole
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
          loadUsers();
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    // ── Password Update Modal Controls ──
    let currentUpdatingUserId = null;
    function openUpdatePasswordModal(userId, username) {
      currentUpdatingUserId = userId;
      const idInput = document.getElementById('updatePwdUserId');
      if (idInput) idInput.value = userId;
      const label = document.getElementById('updatePwdUserLabel');
      if (label) label.innerText = 'ইউজার: ' + (username || '#' + userId) + ' (আইডি #' + userId + ')';
      const p1 = document.getElementById('modalNewPassword');
      if (p1) p1.value = '';
      const p2 = document.getElementById('modalConfirmPassword');
      if (p2) p2.value = '';
      const alertBox = document.getElementById('updatePwdAlert');
      if (alertBox) alertBox.style.display = 'none';
      const modal = document.getElementById('updatePasswordModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeUpdatePasswordModal() {
      const modal = document.getElementById('updatePasswordModal');
      if (modal) modal.style.display = 'none';
    }

    function togglePwdVisibility(inputId, btn) {
      const input = document.getElementById(inputId);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.innerText = input.type === 'password' ? '👁️' : '🙈';
      }
    }

    async function submitUpdatePassword() {
      const userId = document.getElementById('updatePwdUserId')?.value || currentUpdatingUserId;
      const newPassword = (document.getElementById('modalNewPassword')?.value || '').trim();
      const confirmPassword = (document.getElementById('modalConfirmPassword')?.value || '').trim();
      const submitBtn = document.getElementById('btnSubmitPwd');

      if (!newPassword) {
        showPwdAlert('নতুন পাসওয়ার্ড প্রদান করুন।', 'error');
        return;
      }
      if (newPassword.length < 3) {
        showPwdAlert('পাসওয়ার্ড কমপক্ষে ৩ অক্ষরের হতে হবে।', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        showPwdAlert('দুইটি পাসওয়ার্ড মিলছে না! পুনরায় চেক করুন।', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ আপডেট হচ্ছে...';
      }

      try {
        const res = await fetch('/api/users/update-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parseInt(userId, 10), newPassword })
        });
        const data = await res.json();
        if (data.success) {
          showPwdAlert('✅ ' + (data.message || 'পাসওয়ার্ড সফলভাবে আপডেট হয়েছে!'), 'success');
          setTimeout(() => {
            closeUpdatePasswordModal();
            loadUsers();
          }, 1200);
        } else {
          showPwdAlert('❌ ' + (data.error || 'আপডেট ব্যর্থ'), 'error');
        }
      } catch (err) {
        showPwdAlert('নেটওয়ার্ক এরর: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = '💾 পাসওয়ার্ড সংরক্ষণ';
        }
      }
    }

    function showPwdAlert(msg, type) {
      const alertBox = document.getElementById('updatePwdAlert');
      if (!alertBox) return;
      alertBox.style.display = 'block';
      alertBox.style.background = (type === 'success') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
      alertBox.style.border = (type === 'success') ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)';
      alertBox.style.color = (type === 'success') ? '#86efac' : '#fca5a5';
      alertBox.innerText = msg;
    }

    // ── Database Reset Modal Controls ──
    function openDatabaseResetModal() {
      const input = document.getElementById('dbResetConfirmInput');
      if (input) input.value = '';
      const alertBox = document.getElementById('dbResetAlert');
      if (alertBox) alertBox.style.display = 'none';
      const modal = document.getElementById('databaseResetModal');
      if (modal) modal.style.display = 'flex';
    }

    function closeDatabaseResetModal() {
      const modal = document.getElementById('databaseResetModal');
      if (modal) modal.style.display = 'none';
    }

    async function submitDatabaseReset() {
      const confirmText = (document.getElementById('dbResetConfirmInput')?.value || '').trim();
      const submitBtn = document.getElementById('btnSubmitReset');
      const mode = (document.querySelector('input[name="dbResetMode"]:checked')?.value) || 'data_only';

      if (confirmText.toUpperCase() !== 'RESET') {
        showResetAlert('রিসেট নিশ্চিত করতে ফিল্ডে বড় হাতের অক্ষরে "RESET" লিখুন।', 'error');
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ রিসেট হচ্ছে...';
      }

      try {
        const res = await fetch('/api/database/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, confirm: 'RESET' })
        });
        const data = await res.json();
        if (data.success) {
          showResetAlert('✅ ' + (data.message || 'ডাটাবেস সফলভাবে রিসেট হয়েছে!'), 'success');
          setTimeout(() => {
            closeDatabaseResetModal();
            location.reload();
          }, 1500);
        } else {
          showResetAlert('❌ ' + (data.error || 'রিসেট ব্যর্থ'), 'error');
        }
      } catch (err) {
        showResetAlert('নেটওয়ার্ক এরর: ' + err.message, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = '💥 নিশ্চিত রিসেট করুন';
        }
      }
    }

    function showResetAlert(msg, type) {
      const alertBox = document.getElementById('dbResetAlert');
      if (!alertBox) return;
      alertBox.style.display = 'block';
      alertBox.style.background = (type === 'success') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
      alertBox.style.border = (type === 'success') ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)';
      alertBox.style.color = (type === 'success') ? '#86efac' : '#fca5a5';
      alertBox.innerText = msg;
    }

    // ── Multi-AI Configuration & Live Test Functions ──
    async function loadAiSettings() {
      try {
        const res = await fetch('/api/ai/settings');
        const data = await res.json();
        if (data.success && data.settings) {
          const s = data.settings;
          const provEl = document.getElementById('activeAiProvider');
          if (provEl) provEl.value = s.activeProvider || 'gemini';
          const gKeyEl = document.getElementById('geminiApiKey');
          if (gKeyEl) gKeyEl.value = s.geminiApiKey || '';
          const gModEl = document.getElementById('geminiModel');
          if (gModEl) gModEl.value = s.geminiModel || 'gemini-3.5-flash-lite';
          const oKeyEl = document.getElementById('openaiApiKey');
          if (oKeyEl) oKeyEl.value = s.openaiApiKey || '';
          const oModEl = document.getElementById('openaiModel');
          if (oModEl) oModEl.value = s.openaiModel || 'gpt-4o-mini';
          onAiProviderChange();
        }
      } catch (err) {
        console.error('loadAiSettings error:', err);
      }
    }

    function onAiProviderChange() {
      const provEl = document.getElementById('activeAiProvider');
      if (!provEl) return;
      const prov = provEl.value;
      const geminiBox = document.getElementById('geminiBox');
      const openaiBox = document.getElementById('openaiBox');
      const desc = document.getElementById('providerDesc');

      if (prov === 'gemini') {
        if (geminiBox) geminiBox.style.opacity = '1';
        if (openaiBox) openaiBox.style.opacity = '0.5';
        if (desc) desc.innerText = '⚡ Gemini 3.5 Flash Lite মডেল ব্যবহার করে মাত্র ~900ms এ যেকোনো জটিল বাংলা নির্দেশ প্রসেস করা যায়।';
      } else if (prov === 'openai') {
        if (geminiBox) geminiBox.style.opacity = '0.5';
        if (openaiBox) openaiBox.style.opacity = '1';
        if (desc) desc.innerText = '🧠 OpenAI ChatGPT (GPT-4o-mini / GPT-4o) মডেল ব্যবহার করে উচ্চ নির্ভুলতায় বট রেসপন্স তৈরি হবে।';
      } else {
        if (geminiBox) geminiBox.style.opacity = '0.4';
        if (openaiBox) openaiBox.style.opacity = '0.4';
        if (desc) desc.innerText = '🛡️ লোকাল অফলাইন এআই: কোনো বাহ্যিক API বা ইন্টারনেটের প্রয়োজন নেই। ১০০% লোকাল রুলস দিয়ে চলে।';
      }
    }

    function togglePasswordVisibility(inputId) {
      const el = document.getElementById(inputId);
      if (el) {
        el.type = el.type === 'password' ? 'text' : 'password';
      }
    }

    async function saveAiSettings() {
      const activeProvider = document.getElementById('activeAiProvider').value;
      const geminiApiKey = document.getElementById('geminiApiKey').value;
      const geminiModel = document.getElementById('geminiModel').value;
      const openaiApiKey = document.getElementById('openaiApiKey').value;
      const openaiModel = document.getElementById('openaiModel').value;

      try {
        const res = await fetch('/api/ai/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeProvider, geminiApiKey, geminiModel, openaiApiKey, openaiModel })
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ ' + data.message);
        } else {
          alert('❌ ব্যর্থ: ' + data.error);
        }
      } catch (err) {
        alert('এরর: ' + err.message);
      }
    }

    async function testAiConnection() {
      const provider = document.getElementById('activeAiProvider').value;
      const apiKey = provider === 'gemini' ? document.getElementById('geminiApiKey').value : document.getElementById('openaiApiKey').value;
      const model = provider === 'gemini' ? document.getElementById('geminiModel').value : document.getElementById('openaiModel').value;

      const resBox = document.getElementById('aiTestResultBox');
      resBox.style.display = 'block';
      resBox.style.background = 'rgba(99, 102, 241, 0.15)';
      resBox.style.border = '1px solid rgba(99, 102, 241, 0.3)';
      resBox.style.color = '#c7d2fe';
      resBox.innerText = '⏳ কানেকশন টেস্ট করা হচ্ছে... অনুগ্রহ করে অপেক্ষা করুন...';

      try {
        const res = await fetch('/api/ai/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey, model })
        });
        const data = await res.json();
        if (data.success) {
          resBox.style.background = 'rgba(37, 211, 102, 0.15)';
          resBox.style.border = '1px solid rgba(37, 211, 102, 0.4)';
          resBox.style.color = '#86efac';
          resBox.innerHTML = \`✅ <strong>সফল!</strong> \${escapeHtml(data.message)} <span style="margin-left:8px; background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:12px; font-weight:700;">⏱️ \${data.latencyMs}ms</span>\`;
        } else {
          resBox.style.background = 'rgba(239, 68, 68, 0.15)';
          resBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
          resBox.style.color = '#fca5a5';
          resBox.innerHTML = \`❌ <strong>ব্যর্থ:</strong> \${escapeHtml(data.error || 'কানেকশন সম্পন্ন করা যায়নি')}\`;
        }
      } catch (err) {
        resBox.style.background = 'rgba(239, 68, 68, 0.15)';
        resBox.style.border = '1px solid rgba(239, 68, 68, 0.4)';
        resBox.style.color = '#fca5a5';
        resBox.innerHTML = \`❌ <strong>নেটওয়ার্ক এরর:</strong> \${escapeHtml(err.message)}\`;
      }
    }

    loadData();
    fetchBotStatus();
    fetchLiveChats();
    loadUsers();
    loadAiSettings();
    setInterval(fetchBotStatus, 2500);
    setInterval(fetchLiveChats, 2000);
  </script>
</body>
</html>`;
}

/**
 * Secure Credential Change Portal HTML (WhatsApp One-Time Token)
 */
function renderSecurityPortalHtml(token, user) {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FREND — সিকিউর অ্যাকাউন্ট পোর্টাল</title>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.85);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --success: #22c55e;
      --danger: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Hind Siliguri', 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .security-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 32px;
      width: 100%;
      max-width: 460px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(16px);
    }
    .header { text-align: center; margin-bottom: 24px; }
    .icon { font-size: 40px; margin-bottom: 12px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; }
    p.subtitle { color: var(--text-muted); font-size: 13px; margin-top: 4px; }
    .field { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: #e5e7eb; margin-bottom: 6px; }
    input {
      width: 100%;
      padding: 12px 14px;
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: var(--primary); }
    .btn-submit {
      width: 100%;
      padding: 14px;
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 15px;
      cursor: pointer;
      margin-top: 10px;
      transition: background 0.2s;
    }
    .btn-submit:hover { background: var(--primary-hover); }
    .alert-box {
      margin-top: 16px;
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      display: none;
      text-align: center;
    }
    .badge-user {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      margin-top: 6px;
    }
  </style>
</head>
<body>
  <div class="security-card">
    <div class="header">
      <div class="icon">🔒</div>
      <h1>অ্যাকাউন্ট ক্রিডেনশিয়াল সিকিউরিটি</h1>
      <p class="subtitle">WhatsApp ভেরিফায়েড ওয়ান-টাইম পোর্টাল</p>
      <div class="badge-user">অ্যাকাউন্ট: ${user.display_name || user.username} (@${user.username})</div>
    </div>

    <form id="secForm" onsubmit="handleSecuritySubmit(event)">
      <div class="field">
        <label>বর্তমান ইউজারনেম (Current Username)*</label>
        <input type="text" id="curUsername" required placeholder="বর্তমান ইউজারনেম দিন">
      </div>
      <div class="field">
        <label>বর্তমান পাসওয়ার্ড (Current Password)*</label>
        <input type="password" id="curPassword" required placeholder="বর্তমান পাসওয়ার্ড দিন">
      </div>
      <hr style="border:0; border-top:1px solid var(--card-border); margin: 18px 0;">
      <div class="field">
        <label>নতুন ইউজারনেম (New Username) — <em>ঐচ্ছিক</em></label>
        <input type="text" id="newUsername" placeholder="পরিবর্তন করতে চাইলে লিখুন">
      </div>
      <div class="field">
        <label>নতুন পাসওয়ার্ড (New Password) — <em>ঐচ্ছিক</em></label>
        <input type="password" id="newPassword" placeholder="কমপক্ষে ৪ অক্ষর">
      </div>

      <button type="submit" class="btn-submit" id="btnSubmit">🛡️ ক্রিডেনশিয়াল আপডেট করুন</button>
    </form>

    <div class="alert-box" id="alertBox"></div>
  </div>

  <script>
    async function handleSecuritySubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('btnSubmit');
      const box = document.getElementById('alertBox');
      const currentUsername = document.getElementById('curUsername').value.trim();
      const currentPassword = document.getElementById('curPassword').value.trim();
      const newUsername = document.getElementById('newUsername').value.trim();
      const newPassword = document.getElementById('newPassword').value.trim();

      if (!newUsername && !newPassword) {
        alert('নতুন ইউজারনেম অথবা নতুন পাসওয়ার্ডের যেকোনো একটি পূরণ করুন!');
        return;
      }

      btn.disabled = true;
      btn.innerText = 'আপডেট করা হচ্ছে...';
      box.style.display = 'none';

      try {
        const res = await fetch('/api/account/update-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: '${token}',
            currentUsername,
            currentPassword,
            newUsername,
            newPassword
          })
        });
        const data = await res.json();
        box.style.display = 'block';
        if (data.success) {
          box.style.background = 'rgba(34, 197, 94, 0.2)';
          box.style.color = '#86efac';
          box.innerHTML = '✅ ' + data.message + '<br><small>আপনার WhatsApp-এ নিশ্চিতকরণ নোটিফিকেশন পাঠানো হয়েছে।</small>';
          document.getElementById('secForm').reset();
        } else {
          box.style.background = 'rgba(239, 68, 68, 0.2)';
          box.style.color = '#fca5a5';
          box.innerText = '❌ ' + (data.error || 'আপডেট ব্যর্থ হয়েছে');
          btn.disabled = false;
          btn.innerText = '🛡️ ক্রিডেনশিয়াল আপডেট করুন';
        }
      } catch (err) {
        box.style.display = 'block';
        box.style.background = 'rgba(239, 68, 68, 0.2)';
        box.style.color = '#fca5a5';
        box.innerText = '❌ নেটওয়ার্ক এরর: ' + err.message;
        btn.disabled = false;
        btn.innerText = '🛡️ ক্রিডেনশিয়াল আপডেট করুন';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Google OAuth Result Status HTML
 */
function renderOAuthResultHtml(success, message, email = '') {
  return `<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Calendar সংযোগ স্থিতি — FREND</title>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@600;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { background: #0b0f19; color: #fff; font-family: 'Hind Siliguri', 'Inter', sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; }
    .box { background: rgba(17,24,39,0.9); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 36px; max-width: 450px; text-align: center; }
    h1 { font-size: 22px; margin-bottom: 8px; color: ${success ? '#22c55e' : '#ef4444'}; }
    p { color: #9ca3af; font-size: 14px; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="box">
    <div style="font-size: 48px; margin-bottom: 12px;">${success ? '🎉' : '⚠️'}</div>
    <h1>${success ? 'Google Calendar সংযুক্ত হয়েছে!' : 'সংযোগ ব্যর্থ হয়েছে'}</h1>
    <p>${message}</p>
    ${email ? '<p style="color:#a5b4fc;font-size:13px;margin-bottom:16px;">সংযুক্ত ইমেইল: ' + email + '</p>' : ''}
    <a href="/dashboard" class="btn">ড্যাশবোর্ডে ফিরে যান</a>
  </div>
</body>
</html>`;
}

/**
 * Start Lightweight Multi-Device Web Server
 */
function startWebDashboardServer(port = 3000) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const reqUserId = url.searchParams.get('userId');
    const userId = reqUserId || getFirstUserId();

    // CORS headers for multi-device sync
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // ── Health Check Route for Railway & Cloud Hosts ──
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() }));
      return;
    }

    // ── Routes ──
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderDashboardHtml(userId));
      return;
    }

    // ── Section 3: WhatsApp Secure Credential Change Portal ──
    if (url.pathname === '/account/security' && req.method === 'GET') {
      const token = url.searchParams.get('token');
      const tokenData = authManager.verifyCredentialChangeToken(token);
      if (!tokenData) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html><html><body style="background:#0b0f19;color:#fff;font-family:sans-serif;text-align:center;padding:40px;">
          <h2 style="color:#ef4444;">⚠️ অবৈধ বা মেয়াদোত্তীর্ণ সিকিউরিটি লিঙ্ক</h2>
          <p style="color:#9ca3af;margin-top:10px;">এই লিঙ্কটি ১০ মিনিট অতিক্রম করেছে অথবা ইতিমধ্যে ব্যবহৃত হয়েছে।</p>
          <p style="color:#9ca3af;margin-top:6px;">WhatsApp-এ আবার <em>"পাসওয়ার্ড পরিবর্তন"</em> লিখে নতুন লিঙ্ক সংগ্রহ করুন।</p>
        </body></html>`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderSecurityPortalHtml(token, tokenData.user));
      return;
    }

    if (url.pathname === '/api/account/update-credentials' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const tokenData = authManager.verifyCredentialChangeToken(data.token);
          if (!tokenData) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'অবৈধ বা মেয়াদোত্তীর্ণ সিকিউরিটি টোকেন' }));
            return;
          }

          if (data.newUsername && data.newUsername.trim()) {
            authManager.changeUsername(
              tokenData.user.id,
              data.currentUsername,
              data.currentPassword,
              data.newUsername.trim(),
              data.token
            );
          }

          if (data.newPassword && data.newPassword.trim()) {
            authManager.changePassword(
              tokenData.user.id,
              data.currentUsername,
              data.currentPassword,
              data.newPassword.trim(),
              data.token
            );
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'আপনার অ্যাকাউন্ট ক্রিডেনশিয়াল সফলভাবে আপডেট হয়েছে!' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // ── Section 4 & 5: Individual Google OAuth Routes ───────────
    if (url.pathname === '/oauth2/google/connect' && req.method === 'GET') {
      try {
        const targetUserId = parseInt(url.searchParams.get('userId') || '1', 10);
        const redirectUri = `http://${req.headers.host || 'localhost:3000'}/oauth2/google/callback`;
        const { authUrl } = calendarSync.generateUserAuthUrl(targetUserId, redirectUri);
        res.writeHead(302, { Location: authUrl });
        res.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderOAuthResultHtml(false, err.message));
      }
      return;
    }

    if (url.pathname === '/oauth2/google/callback' && req.method === 'GET') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const redirectUri = `http://${req.headers.host || 'localhost:3000'}/oauth2/google/callback`;

      if (!code || !state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderOAuthResultHtml(false, 'OAuth কোড বা state অনুপস্থিত।'));
        return;
      }

      try {
        const result = await calendarSync.handleOAuthCallback(code, state, redirectUri);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderOAuthResultHtml(true, 'আপনার ব্যক্তিগত Google Calendar সফলভাবে ফ্রেন্ড বটের সাথে যুক্ত হয়েছে!', result.email));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderOAuthResultHtml(false, err.message));
      }
      return;
    }

    if (url.pathname === '/api/calendar/disconnect' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          calendarSync.disconnectCalendar(data.userId || 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'Google Calendar সফলভাবে ডিসকানেক্ট করা হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/data') {
      const activeReminders = db.getActiveReminders(userId);
      const profile = gamification.getUserProfile(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        reminders: activeReminders,
        profile,
        chatLogs: liveChatLogs,
        syncStatus: {
          whatsapp: true,
          calendar: calendarSync.isConfigured(),
          devicesConnected: ['Phone', 'Tablet', 'Web Browser']
        }
      }));
      return;
    }

    if (url.pathname === '/api/live-chat' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        logs: liveChatLogs,
      }));
      return;
    }

    if (url.pathname === '/api/live-chat/clear' && req.method === 'POST') {
      clearLiveChatLogs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'লগ সফলভাবে মুছে ফেলা হয়েছে।' }));
      return;
    }

    if (url.pathname === '/api/test-chat' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const msgText = (data.message || '').trim();
          if (!msgText) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'মেসেজ ফিল্ড খালি হতে পারে না' }));
            return;
          }

          let botReply = '✅ মেসেজ গ্রহণ করা হয়েছে।';
          if (testChatHandler) {
            try {
              botReply = await testChatHandler(msgText);
            } catch (err) {
              botReply = `❌ এরর: ${err.message}`;
            }
          }
          addLiveChatLog(botState.userName || 'আপনি (Web UI)', msgText, botReply || 'কোনো রিপ্লাই নেই');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, reply: botReply }));
          return;
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
          return;
        }
      });
      return;
    }

    if (url.pathname === '/api/complete-task' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.reminderId) {
            const rem = db.getReminderById(userId, data.reminderId);
            db.markReminderSent(data.reminderId);
            if (rem) {
              calendarSync.deleteGoogleCalendarEventBySummaryOrId(userId, rem.google_event_id, rem.content).catch(() => {});
            }
          }
          const taskText = data.taskText || 'সম্পন্ন কাজ';
          const result = gamification.completeTask(userId, taskText, 'web_dashboard');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/add-reminder' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.content) {
            const remindAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour later
            const id = db.saveReminder(userId, data.content, remindAt);
            if (calendarSync.isConfigured() || calendarSync.getUserAuthClient(userId)) {
              calendarSync.addToGoogleCalendar(userId, data.content, remindAt).then(calRes => {
                if (calRes && typeof calRes === 'object' && calRes.eventId) {
                  db.updateReminderGoogleEventId(id, calRes.eventId);
                }
              }).catch(() => {});
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, id }));
            return;
          }
        } catch (e) {}
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false }));
      });
      return;
    }

    if (url.pathname === '/api/backup/download') {
      try {
        let backupPath = cloudBackup.getLatestBackupPath();
        if (!backupPath || !fs.existsSync(backupPath)) {
          await cloudBackup.createCloudBackup(userId);
          backupPath = cloudBackup.getLatestBackupPath();
        }
        if (backupPath && fs.existsSync(backupPath)) {
          const fileName = path.basename(backupPath);
          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="${fileName}"`,
          });
          fs.createReadStream(backupPath).pipe(res);
          return;
        }
      } catch (err) {
        console.error('Backup download error:', err.message);
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Backup generation failed');
      return;
    }

    if (url.pathname === '/api/bot/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: botState.status,
        qrImage: botState.qrDataUrl,
        pairingCode: botState.pairingCode,
        userName: botState.userName,
        userPhone: botState.userPhone,
        connectedAt: botState.connectedAt,
        uptime: process.uptime(),
      }));
      return;
    }

    if (url.pathname === '/api/bot/restart' && req.method === 'POST') {
      if (botState.onRestartRequest) {
        botState.onRestartRequest().catch(() => {});
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'বট রিস্টার্ট প্রক্রিয়া শুরু হয়েছে...' }));
      return;
    }

    if (url.pathname === '/api/bot/clear-session' && req.method === 'POST') {
      try {
        if (botState.clientRef) {
          try { await botState.clientRef.destroy(); } catch (_) {}
        }
        const sessionPath = path.join(__dirname, '..', 'data', '.wwebjs_auth');
        if (fs.existsSync(sessionPath)) {
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        botState.status = 'INITIALIZING';
        botState.qrDataUrl = null;
        botState.pairingCode = null;
        if (botState.onRestartRequest) {
          botState.onRestartRequest().catch(() => {});
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'সেশন পরিষ্কার করা হয়েছে এবং নতুন ফ্রেশ QR তৈরি হচ্ছে...' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/bot/request-code' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const phone = String(data.phoneNumber || '').replace(/\D/g, '');
          if (!phone || phone.length < 10) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'সঠিক আন্তর্জাতিক ফোন নম্বর দিন (যেমন: 88017XXXXXXXX)' }));
            return;
          }
          if (!botState.clientRef) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'বট ক্লায়েন্ট লোড হতে দিন, এরপর চেষ্টা করুন।' }));
            return;
          }
          const code = await botState.clientRef.requestPairingCode(phone);
          botState.pairingCode = code;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, code, message: 'পেয়ারিং কোড সফলভাবে তৈরি হয়েছে!' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/bot/logout' && req.method === 'POST') {
      if (botState.clientRef) {
        botState.clientRef.logout().catch(() => {});
        botState.status = 'DISCONNECTED';
        botState.qrDataUrl = null;
        botState.pairingCode = null;
        botState.userName = null;
        botState.userPhone = null;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'সফলভাবে ডিসকানেক্ট করা হয়েছে।' }));
      return;
    }

    // ── Laravel / PHP WhatsApp Send API ──
    if (url.pathname === '/api/send-message' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.to || !data.message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'to এবং message ফিল্ড প্রয়োজন' }));
            return;
          }
          if (!botState.clientRef || botState.status !== 'CONNECTED') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'WhatsApp বর্তমানে সংযুক্ত নেই' }));
            return;
          }
          let target = String(data.to).trim();
          if (!target.endsWith('@lid') && !target.endsWith('@g.us') && !target.endsWith('@c.us')) {
            let digits = target.replace(/\D/g, '');
            if (digits.startsWith('01') && digits.length === 11) {
              digits = '88' + digits;
            } else if (digits.startsWith('+88')) {
              digits = digits.replace(/^\+/, '');
            }
            if (digits) target = `${digits}@c.us`;
          } else if (target.endsWith('@c.us')) {
            let userPart = target.split('@')[0];
            let digits = userPart.replace(/\D/g, '');
            if (digits.startsWith('01') && digits.length === 11) {
              target = `88${digits}@c.us`;
            }
          }

          if (typeof botState.sendReplyFn === 'function') {
            await botState.sendReplyFn(target, data.message);
          } else {
            const BOT_SIGNATURE = '\u200B\u200C\u200D\uFEFF';
            await botState.clientRef.sendMessage(target, BOT_SIGNATURE + data.message);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'WhatsApp বার্তা সফলভাবে পাঠানো হয়েছে।' }));
          return;
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
          return;
        }
      });
      return;
    }

    // ── Laravel / PHP WhatsApp Group Creation API (Mediation & Peacemaking) ──
    if (url.pathname === '/api/create-group' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.title || !data.participants || !Array.isArray(data.participants)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'title এবং participants (array) ফিল্ড প্রয়োজন' }));
            return;
          }
          if (!botState.clientRef || botState.status !== 'CONNECTED') {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'WhatsApp বর্তমানে সংযুক্ত নেই' }));
            return;
          }

          const validParticipants = data.participants.map(p => {
            let t = String(p).trim();
            if (!t.endsWith('@c.us') && !t.endsWith('@lid')) {
              t = t.replace(/\D/g, '') + '@c.us';
            }
            return t;
          }).filter(Boolean);

          const group = await botState.clientRef.createGroup(data.title, validParticipants);
          let inviteCode = null;
          try {
            if (group && typeof group.getInviteCode === 'function') {
              inviteCode = await group.getInviteCode();
            }
          } catch (_) {}

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'গ্রুপ সফলভাবে তৈরি করা হয়েছে।',
            groupId: group.gid ? group.gid._serialized : (group.id ? group.id._serialized : null),
            inviteCode: inviteCode,
            inviteLink: inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : null
          }));
          return;
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: e.message }));
          return;
        }
      });
      return;
    }

    // ── User Management & Admin APIs ──
    if (url.pathname === '/api/users' && req.method === 'GET') {
      try {
        const users = authManager.getAllUsers().map(u => ({
          ...u,
          password: '••••••••', // Masked for security: never expose plaintext or hashes
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, users }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/users/add' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const id = authManager.createUser(
            data.username,
            data.password,
            data.displayName,
            data.boundPhone,
            data.role || 'user',
            data.planId || 'free',
            'admin'
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, id, message: 'ইউজার সফলভাবে তৈরি হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Toggle Account Status (Active <-> Disabled) - Section 7
    if (url.pathname === '/api/users/status' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          authManager.setUserAccountStatus(data.id, data.status, 'admin', data.reason || '');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: data.status === 'disabled'
              ? 'ইউজার অ্যাকাউন্ট নিষ্ক্রিয় করা হয়েছে এবং সক্রিয় সেশন বাতিল করা হয়েছে।'
              : 'ইউজার অ্যাকাউন্ট সফলভাবে পুনঃসক্রিয় করা হয়েছে।'
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Assign Plan to User - Section 8
    if (url.pathname === '/api/users/plan' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          authManager.assignPlanToUser(data.id, data.planId, 'admin');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'ইউজার প্ল্যান সফলভাবে আপডেট করা হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/users/edit' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          authManager.updateUser(data.id, data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'ইউজার সফলভাবে আপডেট হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Direct User Password Update API
    if (url.pathname === '/api/users/update-password' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.id) throw new Error('ইউজার আইডি প্রদান করা হয়নি।');
          if (!data.newPassword || !data.newPassword.trim()) {
            throw new Error('নতুন পাসওয়ার্ড প্রদান করুন।');
          }
          authManager.adminSetUserPassword(data.id, data.newPassword.trim(), 'admin');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'পাসওয়ার্ড সফলভাবে আপডেট করা হয়েছে!' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // System Database Reset API
    if (url.pathname === '/api/database/reset' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (data.confirm !== 'RESET') {
            throw new Error('রিসেট নিশ্চিত করতে ফিল্ডে "RESET" টাইপ করুন।');
          }
          const mode = (data.mode === 'full') ? 'full' : 'data_only';
          const result = db.resetDatabase({ mode, actorId: 'admin' });
          clearLiveChatLogs();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: result.message, stats: result.stats }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/users/delete' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          authManager.deleteUser(data.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'ইউজার এবং সংশ্লিষ্ট সকল ডাটা সফলভাবে মুছে ফেলা হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/users/unbind' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          authManager.unbindUserPhone(data.id);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: 'WhatsApp নম্বর সফলভাবে আনবাইন্ড করা হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Admin Audit Logs API
    if (url.pathname === '/api/admin/audit-logs' && req.method === 'GET') {
      try {
        const logs = authManager.getAuditLogs(100);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, logs }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // Admin Plans API
    if (url.pathname === '/api/admin/plans' && req.method === 'GET') {
      try {
        const plans = authManager.getAllPlans();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, plans }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ── Self-Healing Diagnostic Logs & Health APIs ──
    if (url.pathname === '/api/admin/self-healing/logs' && req.method === 'GET') {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const logs = db.getDiagnosticLogs(limit);
        const stats = db.getDiagnosticStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, logs, stats }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/admin/self-healing/health' && req.method === 'GET') {
      try {
        const health = selfHealingEngine.getSystemHealthCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, health }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    // ── Autonomous Evolution & Safe Self-Update APIs ───────────
    if (url.pathname === '/api/admin/evolution/status' && req.method === 'GET') {
      try {
        const status = selfUpdateEngine.getEvolutionStatus();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...status }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/admin/evolution/history' && req.method === 'GET') {
      try {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const history = db.getEvolutionHistory(limit);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, history }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/admin/evolution/flags' && req.method === 'GET') {
      try {
        const flags = featureFlags.getAll();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, flags }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/admin/evolution/flags/toggle' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if (!data.key) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Flag key is required' }));
            return;
          }
          const current = featureFlags.isEnabled(data.key, true);
          if (current) {
            featureFlags.disable(data.key);
          } else {
            featureFlags.enable(data.key);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, key: data.key, enabled: !current }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/admin/evolution/run-cycle' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const result = await selfUpdateEngine.executeSelfUpdate({
            reason: data.reason || 'Admin Requested Safe Autonomous Update',
            actionType: data.actionType || 'intent_routing_correction',
            filesChanged: ['src/selfUpdateEngine.js'],
            metadata: data.metadata || {}
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // ── Multi-AI & API Management APIs ──
    if (url.pathname === '/api/ai/settings' && req.method === 'GET') {
      try {
        const settings = aiConfig.getSettings();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, settings }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
      return;
    }

    if (url.pathname === '/api/ai/settings' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          const updated = aiConfig.updateSettings(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, settings: updated, message: 'AI সেটিংস সফলভাবে সংরক্ষিত হয়েছে।' }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/ai/test' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body || '{}');
          const result = await aiConfig.testConnection(data.provider, data.apiKey, data.model);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️ পোর্ট ${port} ব্যস্ত আছে। ড্যাশবোর্ড স্কিপ করা হলো, বট স্বাভাবিকভাবে চালু থাকবে।`);
    } else {
      console.error('ওয়েব সার্ভার ত্রুটি:', err.message);
    }
  });

  const listenPort = parseInt(port, 10) || 3000;
  server.listen(listenPort, '0.0.0.0', () => {
    const localIp = getLocalIpAddress();
    console.log(`🌐 মাল্টি-ডিভাইস ওয়েব ড্যাশবোর্ড চালু: http://0.0.0.0:${listenPort}`);
    console.log(`📲 ফোন বা ট্যাবলেটে দেখতে ব্রাউজারে খুলো: http://${localIp}:${listenPort}`);
  });

  return server;
}

module.exports = {
  startWebDashboardServer,
  getLocalIpAddress,
  renderDashboardHtml,
  setQrCode,
  updateBotState,
  setBotClient,
  getBotState,
  addLiveChatLog,
  getLiveChatLogs,
  clearLiveChatLogs,
  setTestChatHandler,
};
