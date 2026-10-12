/**
 * Calendar View Module — Frend Bot
 * সব রিমাইন্ডারকে ক্যালেন্ডার আকারে প্রদর্শন: সাপ্তাহিক ও মাসিক ভিউ।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));

const BN_MONTHS = [
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
  'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'
];

const BN_DAYS = ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহস্পতি', 'শুক্র', 'শনি'];
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

function toBnNum(num) {
  return String(num).replace(/\d/g, d => BN_DIGITS[d]);
}

/**
 * চলতি সপ্তাহের শুরু (সোমবার) ও শেষ (রবিবার) বের করা
 */
function getWeekRange(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  // Adjust so Monday is day 0
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

/**
 * সাপ্তাহিক ক্যালেন্ডার ভিউ
 */
function getWeeklyCalendar(userId, date = new Date()) {
  const { start, end } = getWeekRange(date);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Fetch reminders for the week
  const reminders = db.prepare(`
    SELECT * FROM reminders
    WHERE user_id = ?
      AND remind_at >= ?
      AND remind_at <= ?
    ORDER BY remind_at ASC
  `).all(userId, start.toISOString(), end.toISOString());

  // Group reminders by date string (YYYY-MM-DD)
  const grouped = {};
  for (const r of reminders) {
    const dStr = r.remind_at.slice(0, 10);
    if (!grouped[dStr]) grouped[dStr] = [];
    grouped[dStr].push(r);
  }

  // Format header
  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthName = BN_MONTHS[start.getMonth()];
  const year = start.getFullYear();

  let output = `📅 *সাপ্তাহিক ক্যালেন্ডার (${toBnNum(startDay)} - ${toBnNum(endDay)} ${monthName} ${toBnNum(year)})*\n`;
  output += `───────────────────────\n\n`;

  // Iterate over 7 days of the week
  for (let i = 0; i < 7; i++) {
    const current = new Date(start);
    current.setDate(start.getDate() + i);
    const dStr = current.toISOString().slice(0, 10);
    const dayName = BN_DAYS[current.getDay()];
    const dateNum = toBnNum(current.getDate());
    const isToday = dStr === todayStr;

    const todayMarker = isToday ? ' 👉 *[আজ]*' : '';
    output += `🗓️ *${dayName}, ${dateNum} ${monthName}*${todayMarker}\n`;

    const dayReminders = grouped[dStr] || [];
    if (dayReminders.length === 0) {
      output += `   _কোনো রিমাইন্ডার নেই_\n\n`;
    } else {
      for (const r of dayReminders) {
        const timeObj = new Date(r.remind_at);
        const timeStr = timeObj.toLocaleTimeString('bn-BD', {
          timeZone: 'Asia/Dhaka',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });
        const statusEmoji = r.is_sent ? '✅' : '⏰';
        output += `   ${statusEmoji} *${r.content}* (${timeStr}) _#${r.id}_\n`;
      }
      output += `\n`;
    }
  }

  output += `───────────────────────\n`;
  output += `💡 _মাসিক ক্যালেন্ডার দেখতে লেখো: *মাসিক ক্যালেন্ডার*_\n`;
  output += `_কাজ শেষ হলে লেখো: *শেষ [নম্বর]*_`;

  return output;
}

/**
 * মাসিক ক্যালেন্ডার ভিউ (Grid + Event List)
 */
function getMonthlyCalendar(userId, year, month) {
  const now = new Date();
  const curYear = year || now.getFullYear();
  const curMonth = month !== undefined ? month : now.getMonth(); // 0-indexed

  const firstDay = new Date(curYear, curMonth, 1);
  const lastDay = new Date(curYear, curMonth + 1, 0);
  const totalDays = lastDay.getDate();
  const startDayOfWeek = firstDay.getDay(); // 0: Sun, 1: Mon...

  const startIso = firstDay.toISOString();
  const endIso = new Date(curYear, curMonth + 1, 0, 23, 59, 59, 999).toISOString();

  // Fetch reminders for the whole month
  const reminders = db.prepare(`
    SELECT * FROM reminders
    WHERE user_id = ?
      AND remind_at >= ?
      AND remind_at <= ?
    ORDER BY remind_at ASC
  `).all(userId, startIso, endIso);

  // Group by day of month
  const daysWithEvents = new Map();
  for (const r of reminders) {
    const d = new Date(r.remind_at).getDate();
    if (!daysWithEvents.has(d)) daysWithEvents.set(d, []);
    daysWithEvents.get(d).push(r);
  }

  const monthName = BN_MONTHS[curMonth];
  const todayDate = now.getMonth() === curMonth && now.getFullYear() === curYear ? now.getDate() : null;

  let output = `📅 *ক্যালেন্ডার — ${monthName} ${toBnNum(curYear)}*\n\n`;
  output += `\`\`\`\n`;
  output += `রবি  সোম  মঙ্গল  বুধ  বৃহ  শুক্র  শনি\n`;

  let currentLine = '';
  // Empty spaces before first day
  for (let i = 0; i < startDayOfWeek; i++) {
    currentLine += '    ';
  }

  for (let day = 1; day <= totalDays; day++) {
    const hasEvent = daysWithEvents.has(day);
    const isToday = day === todayDate;

    let dayStr = String(day);
    if (dayStr.length === 1) dayStr = ' ' + dayStr;

    if (isToday && hasEvent) {
      dayStr = `[${dayStr.trim()}*]`;
    } else if (isToday) {
      dayStr = `[${dayStr.trim()}]`;
    } else if (hasEvent) {
      dayStr = ` ${dayStr.trim()}*`;
    } else {
      dayStr = `  ${dayStr.trim()}`;
    }

    // Pad right to 4 characters
    dayStr = dayStr.padEnd(5, ' ');
    currentLine += dayStr;

    if ((startDayOfWeek + day) % 7 === 0 || day === totalDays) {
      output += currentLine.trimEnd() + '\n';
      currentLine = '';
    }
  }

  output += `\`\`\`\n`;
  output += `_চিহ্ন: [ ] = আজ  ·  * = রিমাইন্ডার আছে_\n\n`;

  // List of upcoming reminders in this month
  if (reminders.length === 0) {
    output += `📭 _এই মাসে কোনো রিমাইন্ডার সেট করা নেই।_\n`;
  } else {
    output += `📌 *এই মাসের রিমাইন্ডারসমূহ (${reminders.length}টি):*\n`;
    for (const r of reminders.slice(0, 10)) {
      const timeObj = new Date(r.remind_at);
      const dayNum = toBnNum(timeObj.getDate());
      const timeStr = timeObj.toLocaleTimeString('bn-BD', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const check = r.is_sent ? '✅' : '⏰';
      output += `• ${dayNum} ${monthName}: ${check} *${r.content}* (${timeStr}) _#${r.id}_\n`;
    }
    if (reminders.length > 10) {
      output += `_...আরো ${reminders.length - 10}টি রিমাইন্ডার আছে_\n`;
    }
  }

  output += `\n💡 _সাপ্তাহিক রুটিন দেখতে: *সাপ্তাহিক ক্যালেন্ডার*_`;
  return output;
}

/**
 * Raw data for Web Dashboard / Multi-device API
 */
function getCalendarEventsJson(userId) {
  const reminders = db.prepare(`
    SELECT * FROM reminders
    WHERE user_id = ?
    ORDER BY remind_at ASC
  `).all(userId);

  return reminders.map(r => ({
    id: r.id,
    title: r.content,
    start: r.remind_at,
    isSent: Boolean(r.is_sent),
  }));
}

module.exports = {
  getWeeklyCalendar,
  getMonthlyCalendar,
  getCalendarEventsJson,
  toBnNum,
  BN_MONTHS,
};
