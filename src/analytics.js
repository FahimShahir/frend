/**
 * Analytics & Insights Module
 * ব্যবহারকারীর অভ্যাস ট্র্যাক করে এবং রিপোর্ট দেয়।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));

// ─── Analytics Tables ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    hour_of_day INTEGER,
    day_of_week INTEGER,
    metadata TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminder_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    reminder_id INTEGER,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    was_sent INTEGER DEFAULT 0,
    was_offline INTEGER DEFAULT 0,
    delay_minutes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Category Detection ───────────────────────────────────────
const CATEGORIES = {
  'ওষুধ|medicine|tablet|capsule|pill|ডাক্তার|doctor': 'স্বাস্থ্য',
  'মিটিং|meeting|interview|interview|অফিস|office': 'কাজ',
  'বাজার|shopping|কিনতে|buy|সুপার|shop': 'কেনাকাটা',
  'ফোন|call|ring|কল': 'যোগাযোগ',
  'খাওয়া|খাবার|lunch|dinner|breakfast|meal': 'খাওয়াদাওয়া',
  'পড়া|study|exam|class|homework': 'পড়াশোনা',
  'জন্মদিন|birthday|anniversary|বিবাহ': 'উৎসব',
  'বিল|bill|payment|pay|টাকা|bank': 'আর্থিক',
};

function detectCategory(text) {
  const lower = text.toLowerCase();
  for (const [pattern, category] of Object.entries(CATEGORIES)) {
    const keywords = pattern.split('|');
    if (keywords.some(k => lower.includes(k))) {
      return category;
    }
  }
  return 'সাধারণ';
}

// ─── Event Tracking ───────────────────────────────────────────
function trackEvent(userId, eventType, content = '', metadata = {}) {
  const now = new Date();
  const category = content ? detectCategory(content) : 'সাধারণ';
  db.prepare(`
    INSERT INTO analytics_events (user_id, event_type, category, hour_of_day, day_of_week, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    eventType,
    category,
    now.getHours(),
    now.getDay(),
    JSON.stringify(metadata)
  );
}

function trackReminderSent(userId, reminderId, content, wasOffline = false) {
  const category = detectCategory(content);
  db.prepare(`
    INSERT INTO reminder_completions (user_id, reminder_id, content, category, was_sent, was_offline)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(userId, reminderId, content, category, wasOffline ? 1 : 0);
  trackEvent(userId, 'reminder_sent', content);
}

// ─── Analytics Queries ────────────────────────────────────────
function getUserAnalytics(userId) {
  // Total counts
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM notes WHERE user_id = ?) as total_notes,
      (SELECT COUNT(*) FROM reminders WHERE user_id = ?) as total_reminders,
      (SELECT COUNT(*) FROM reminder_completions WHERE user_id = ?) as reminders_sent,
      (SELECT COUNT(*) FROM analytics_events WHERE user_id = ?) as total_events
  `).get(userId, userId, userId, userId);

  // Most active hours (top 3)
  const busyHours = db.prepare(`
    SELECT hour_of_day, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ?
    GROUP BY hour_of_day
    ORDER BY count DESC
    LIMIT 3
  `).all(userId);

  // Most active days
  const busyDays = db.prepare(`
    SELECT day_of_week, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ?
    GROUP BY day_of_week
    ORDER BY count DESC
    LIMIT 3
  `).all(userId);

  // Top categories of reminders
  const topCategories = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM reminder_completions
    WHERE user_id = ?
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `).all(userId);

  // Notes by category
  const noteCategories = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ? AND event_type = 'note_saved'
    GROUP BY category
    ORDER BY count DESC
    LIMIT 3
  `).all(userId);

  // Last 7 days activity
  const weeklyActivity = db.prepare(`
    SELECT DATE(created_at) as day, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ? AND created_at >= DATE('now', '-7 days')
    GROUP BY day
    ORDER BY day DESC
  `).all(userId);

  // Offline reminders count
  const offlineCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM reminder_completions
    WHERE user_id = ? AND was_offline = 1
  `).get(userId);

  // Overdue / Uncompleted reminders (Tasks most often forgotten)
  const overdueTasks = db.prepare(`
    SELECT category, COUNT(*) as count
    FROM reminder_completions
    WHERE user_id = ?
    GROUP BY category
    ORDER BY count DESC
    LIMIT 3
  `).all(userId);

  // Peak reminder creation times
  const reminderPeakHours = db.prepare(`
    SELECT hour_of_day, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ? AND event_type IN ('reminder_set', 'smart_reminder_set')
    GROUP BY hour_of_day
    ORDER BY count DESC
    LIMIT 3
  `).all(userId);

  return {
    totals,
    busyHours,
    busyDays,
    topCategories,
    noteCategories,
    weeklyActivity,
    offlineCount: offlineCount.count,
    overdueTasks,
    reminderPeakHours,
  };
}

function getInsights(userId) {
  const data = getUserAnalytics(userId);
  const insights = [];

  // Peak reminder requirement hours
  if (data.reminderPeakHours && data.reminderPeakHours.length > 0) {
    const topHour = data.reminderPeakHours[0].hour_of_day;
    const period = topHour < 6 ? 'রাত' : topHour < 12 ? 'সকাল' : topHour < 16 ? 'দুপুর' : topHour < 20 ? 'বিকাল' : 'রাত';
    const hourLabel = topHour > 12 ? `${topHour - 12}টা` : `${topHour}টা`;
    insights.push(`⏰ *রিমাইন্ডারের পিক সময়:* তোমার সবচেয়ে বেশি রিমাইন্ডার লাগে *${period} ${hourLabel}য়* (${data.reminderPeakHours[0].count} বার)`);
  } else if (data.busyHours.length > 0) {
    const topHour = data.busyHours[0].hour_of_day;
    const timeLabel = topHour < 6 ? 'রাতে' : topHour < 12 ? 'সকালে' : topHour < 17 ? 'দুপুরে' : topHour < 21 ? 'বিকেলে' : 'রাতে';
    insights.push(`⏰ *পিক সময়:* তুমি সবচেয়ে বেশি সক্রিয় থাকো *${timeLabel}* (${topHour}:00)`);
  }

  // Forgotten / Critical categories
  if (data.topCategories.length > 0) {
    const top = data.topCategories[0];
    insights.push(`📌 *যে কাজ বেশি মনে রাখতে হয়:* *${top.category}* সংক্রান্ত বিষয় তুমি সবচেয়ে বেশি মনে রাখতে চাও (${top.count}টি রিমাইন্ডার)`);
    if (top.category === 'স্বাস্থ্য') {
      insights.push(`💊 *স্বাস্থ্য পরামর্শ:* ওষুধের রিমাইন্ডার সবচেয়ে বেশি সেট করছো — সময়মতো ওষুধ খাওয়ার ভালো অভ্যাস বজায় রাখো!`);
    } else if (top.category === 'কেনাকাটা') {
      insights.push(`🛒 *বাজার পরামর্শ:* বাজারের তালিকা ভুলে যাওয়ার প্রবণতা বেশি — কেনাকাটার জন্য একটি নির্দিষ্ট সময় নির্ধারণ করো!`);
    }
  }

  // Day insight
  if (data.busyDays.length > 0) {
    const dayNames = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];
    const topDay = data.busyDays[0].day_of_week;
    insights.push(`📅 *সবচেয়ে ব্যস্ত দিন:* *${dayNames[topDay]}বারে* তোমার ওপর কাজের চাপ বেশি থাকে`);
  }

  // Offline usage
  if (data.offlineCount > 0) {
    insights.push(`📴 *অফলাইন ব্যাকআপ:* ${data.offlineCount}টি রিমাইন্ডার অফলাইনে থাকাকালীন Desktop-এ রিসিভ করেছো`);
  }

  // Activity streak
  if (data.weeklyActivity.length >= 5) {
    insights.push(`🔥 *সক্রিয়তা:* গত ৭ দিনের মধ্যে ${data.weeklyActivity.length} দিন ফ্রেন্ড ব্যবহার করেছো!`);
  }

  return insights;
}

// ─── Report Formatter ─────────────────────────────────────────
function formatDayBar(count, max) {
  const bars = Math.round((count / Math.max(max, 1)) * 8);
  return '▓'.repeat(bars) + '░'.repeat(8 - bars);
}

function formatReport(userId) {
  const data = getUserAnalytics(userId);
  const { totals, busyHours, busyDays, topCategories, weeklyActivity } = data;

  const DAY_NAMES = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];

  let report = `*📊 তোমার ফ্রেন্ড রিপোর্ট*\n`;
  report += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Overview
  report += `*📈 সার্বিক হিসাব:*\n`;
  report += `📝 মোট নোট: *${totals.total_notes}টি*\n`;
  report += `⏰ মোট রিমাইন্ডার: *${totals.total_reminders}টি*\n`;
  report += `✅ পাঠানো রিমাইন্ডার: *${totals.reminders_sent}টি*\n\n`;

  // Weekly activity
  if (weeklyActivity.length > 0) {
    report += `*📅 গত ৭ দিনের কার্যক্রম:*\n`;
    const maxCount = Math.max(...weeklyActivity.map(d => d.count));
    for (const day of weeklyActivity) {
      const date = new Date(day.day);
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      report += `${label} ${formatDayBar(day.count, maxCount)} ${day.count}\n`;
    }
    report += '\n';
  }

  // Top categories & forgotten task tendencies
  if (topCategories.length > 0) {
    report += `*🏷️ বেশি যে বিষয়ে মনে রাখতে হয়:*\n`;
    for (const cat of topCategories) {
      report += `• ${cat.category}: *${cat.count}টি*\n`;
    }
    report += '\n';
  }

  // Peak reminder requirement hours
  if (data.reminderPeakHours && data.reminderPeakHours.length > 0) {
    report += `*⏰ সবচেয়ে বেশি রিমাইন্ডার লাগে যে সময়ে:*\n`;
    for (const h of data.reminderPeakHours) {
      const timeStr = `${h.hour_of_day}:00–${h.hour_of_day + 1}:00`;
      report += `• ${timeStr}: *${h.count}টি রিমাইন্ডার*\n`;
    }
    report += '\n';
  } else if (busyHours.length > 0) {
    report += `*⏰ সবচেয়ে সক্রিয় সময়:*\n`;
    for (const h of busyHours) {
      const timeStr = `${h.hour_of_day}:00–${h.hour_of_day + 1}:00`;
      report += `• ${timeStr}: ${h.count}টি কার্যক্রম\n`;
    }
    report += '\n';
  }

  // Busy days
  if (busyDays.length > 0) {
    report += `*📆 সবচেয়ে ব্যস্ত দিন:*\n`;
    for (const d of busyDays) {
      report += `• ${DAY_NAMES[d.day_of_week]}বার: ${d.count}টি\n`;
    }
    report += '\n';
  }

  // Offline stats
  if (data.offlineCount > 0) {
    report += `*📴 অফলাইন নোটিফিকেশন:* ${data.offlineCount}টি\n\n`;
  }

  // Insights
  const insights = getInsights(userId);
  if (insights.length > 0) {
    report += `*🧠 AI ইনসাইট:*\n`;
    for (const ins of insights) {
      report += `${ins}\n`;
    }
  }

  report += `\n_"ইনসাইট" লিখলে বিস্তারিত পাবে।_`;
  return report;
}

function formatInsights(userId) {
  const insights = getInsights(userId);
  const data = getUserAnalytics(userId);

  if (insights.length === 0) {
    return (
      `🧠 *ইনসাইট পেতে আরো ব্যবহার করো!*\n\n` +
      `নোট ও রিমাইন্ডার সেট করতে থাকো — ফ্রেন্ড তোমার অভ্যাস শিখবে।`
    );
  }

  let msg = `*🧠 তোমার ব্যক্তিগত ইনসাইট:*\n\n`;
  for (const ins of insights) {
    msg += `${ins}\n`;
  }

  // Suggestions based on patterns
  msg += `\n*💡 পরামর্শ:*\n`;
  const topCat = data.topCategories[0];
  if (topCat) {
    msg += `• *${topCat.category}* নিয়ে রিমাইন্ডার বেশি — এই বিষয়ে একটা রুটিন তৈরি করো\n`;
  }
  if (data.busyHours[0]) {
    const h = data.busyHours[0].hour_of_day;
    const isNight = h >= 22 || h < 6;
    if (isNight) {
      msg += `• তুমি রাতে বেশি কাজ করো — পর্যাপ্ত ঘুমের রিমাইন্ডার সেট করো!\n`;
    }
  }

  return msg;
}

module.exports = {
  trackEvent, trackReminderSent,
  getUserAnalytics, formatReport, formatInsights,
  detectCategory,
};
