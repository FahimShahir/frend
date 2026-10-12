/**
 * Smart Notification Timing Module — Frend Bot
 * ব্যবহারকারীর অভ্যাস অনুযায়ী বুদ্ধিমান রিমাইন্ডার সময় নির্ধারণ ও সাজেস্ট করা।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));
const { detectCategory } = require('./analytics');

// Default category-recommended time slots
const CATEGORY_DEFAULT_HOURS = {
  'স্বাস্থ্য': 8,      // সকাল ৮:০০ (ওষুধ, স্বাস্থ্য)
  'কাজ': 10,          // সকাল ১০:০০ (মিটিং, অফিস, প্রজেক্ট)
  'পড়াশোনা': 9,      // সকাল ৯:০০ (ক্লাস, পড়া)
  'কেনাকাটা': 17,     // বিকাল ৫:০০ (বাজার, শপিং)
  'যোগাযোগ': 18,     // সন্ধ্যা ৬:০০ (ফোন, কল)
  'আর্থিক': 11,       // সকাল ১১:০০ (বিল, ব্যাংক)
  'খাওয়াদাওয়া': 13,   // দুপুর ১:০০
  'উৎসব': 19,         // সন্ধ্যা ৭:০০
  'সাধারণ': 9,        // ডিফল্ট সকাল ৯:০০
};

/**
 * ব্যবহারকারীর অ্যাক্টিভিটি প্যাটার্ন ও পিক আওয়ার বের করা
 */
function getUserTimingHabits(userId) {
  // Query completion hours from analytics & completed tasks
  const hourlyRows = db.prepare(`
    SELECT hour_of_day, COUNT(*) as count
    FROM analytics_events
    WHERE user_id = ? AND hour_of_day IS NOT NULL
    GROUP BY hour_of_day
    ORDER BY count DESC
  `).all(userId);

  // Group by time windows
  let morning = 0;   // 6 to 11
  let afternoon = 0; // 12 to 16
  let evening = 0;   // 17 to 20
  let night = 0;     // 21 to 23 + 0 to 5

  const hourlyMap = {};
  for (const row of hourlyRows) {
    hourlyMap[row.hour_of_day] = row.count;
    const h = row.hour_of_day;
    if (h >= 6 && h <= 11) morning += row.count;
    else if (h >= 12 && h <= 16) afternoon += row.count;
    else if (h >= 17 && h <= 20) evening += row.count;
    else night += row.count;
  }

  // Determine peak window
  const windows = [
    { name: 'সকাল (৬টা - ১১টা)', count: morning, defaultHour: 9 },
    { name: 'দুপুর (১২টা - ৪টা)', count: afternoon, defaultHour: 14 },
    { name: 'বিকাল/সন্ধ্যা (৫টা - ৮টা)', count: evening, defaultHour: 18 },
    { name: 'রাত (৯টা - ১২টা)', count: night, defaultHour: 21 },
  ];
  windows.sort((a, b) => b.count - a.count);

  const peakWindow = windows[0];
  const peakHour = hourlyRows.length > 0 ? hourlyRows[0].hour_of_day : 9;

  return {
    hourlyMap,
    peakHour,
    peakWindow,
    morningCount: morning,
    afternoonCount: afternoon,
    eveningCount: evening,
    nightCount: night,
    hasHabitData: hourlyRows.length >= 3,
  };
}

/**
 * কাজের কনটেক্সট ও অভ্যাস অনুযায়ী সেরা সময় নির্ধারণ করা
 */
function getSuggestedTime(userId, taskText = '') {
  const habits = getUserTimingHabits(userId);
  const category = detectCategory(taskText);

  let targetHour = habits.peakHour;
  let rationale = '';

  // If user has strong category preference
  if (CATEGORY_DEFAULT_HOURS[category]) {
    targetHour = CATEGORY_DEFAULT_HOURS[category];
    rationale = `_${category} ক্যাটেগরির জন্য সেরা সময় বিবেচনা করে_`;
  } else if (habits.hasHabitData) {
    targetHour = habits.peakHour;
    rationale = `_তোমার অভ্যাস অনুযায়ী পিক সময়ে (${habits.peakWindow.name})_`;
  } else {
    targetHour = 9; // Default 9 AM
    rationale = `_সকালের ফ্রেশ সময়ে_`;
  }

  // Compute upcoming timestamp
  const now = new Date();
  const targetDate = new Date();
  targetDate.setMinutes(0);
  targetDate.setSeconds(0);
  targetDate.setMilliseconds(0);

  // If current hour is already past targetHour, schedule for tomorrow
  if (now.getHours() >= targetHour) {
    targetDate.setDate(now.getDate() + 1);
  }
  targetDate.setHours(targetHour);

  const hourStr = targetHour > 12 ? `${targetHour - 12}টা` : `${targetHour}টা`;
  const period = targetHour < 12 ? 'সকাল' : targetHour < 16 ? 'দুপুর' : targetHour < 20 ? 'বিকাল' : 'রাত';
  const isTomorrow = targetDate.getDate() !== now.getDate();
  const dayStr = isTomorrow ? 'আগামীকাল' : 'আজ';

  return {
    targetDate,
    category,
    targetHour,
    formattedBengali: `${dayStr} ${period} ${hourStr}`,
    rationale,
  };
}

/**
 * স্মার্ট টাইমিং প্রোফাইল ফরম্যাটিং
 */
function formatSmartTimingProfile(userId) {
  const habits = getUserTimingHabits(userId);

  const total = habits.morningCount + habits.afternoonCount + habits.eveningCount + habits.nightCount;

  let morningPct = total > 0 ? Math.round((habits.morningCount / total) * 100) : 40;
  let afternoonPct = total > 0 ? Math.round((habits.afternoonCount / total) * 100) : 25;
  let eveningPct = total > 0 ? Math.round((habits.eveningCount / total) * 100) : 20;
  let nightPct = total > 0 ? Math.round((habits.nightCount / total) * 100) : 15;

  const bar = (pct) => '▓'.repeat(Math.round(pct / 10)) + '░'.repeat(Math.max(0, 10 - Math.round(pct / 10)));

  return (
    `⏰ *স্মার্ট নোটিফিকেশন টাইমিং প্রোফাইল*\n\n` +
    `🤖 তোমার কাজের অভ্যাস বিশ্লেষণ করে দেখা গেছে:\n\n` +
    `🌅 *সকাল (৬টা - ১১টা):*  [${bar(morningPct)}] ${morningPct}%\n` +
    `☀️ *দুপুর (১২টা - ৪টা):*  [${bar(afternoonPct)}] ${afternoonPct}%\n` +
    `🌆 *সন্ধ্যা (৫টা - ৮টা):*  [${bar(eveningPct)}] ${eveningPct}%\n` +
    `🌙 *রাত (৯টা - ১২টা):*   [${bar(nightPct)}] ${nightPct}%\n\n` +
    `🎯 *তোমার প্রাইম সময়:* *${habits.peakWindow.name}*\n` +
    `💡 *AI রিকমেন্ডেশন:*\n` +
    `তুমি সকালে/পিক সময়ে সবচেয়ে বেশি মনোযোগী থাকো। সময় ছাড়া যেকোনো রিমাইন্ডার দিলে ফ্রেন্ড স্বয়ংক্রিয়ভাবে তোমার সেরা সময়ে সাজেস্ট করবে!`
  );
}

module.exports = {
  getUserTimingHabits,
  getSuggestedTime,
  formatSmartTimingProfile,
  CATEGORY_DEFAULT_HOURS,
};
