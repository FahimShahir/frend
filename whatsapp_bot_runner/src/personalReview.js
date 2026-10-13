/**
 * Multi-Timeframe Comparative Summary & Personal Review Engine — FREND
 * গত ১ দিন, ৭ দিন, ১ মাস এবং ১ বছরের ডেটা তুলনা করে পার্সোনাল রিভিউ ও ইমপ্রুভমেন্ট টিপস দেয়।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const localLearner = require('./localLearner');

const dbPath = path.join(__dirname, '..', 'data', 'frend.db');
const db = new Database(dbPath);

/**
 * নির্দিষ্ট সময়সীমার মধ্যে ইউজারের পরিসংখ্যান সংগ্রহ করে
 * @param {string} userId
 * @param {string} sqliteTimeModifier e.g. '-1 day', '-7 days', '-30 days', '-1 year'
 */
function getTimeframeStats(userId, sqliteTimeModifier) {
  try {
    // নোট সংখ্যা
    const notesCount = db.prepare(`
      SELECT COUNT(*) as count FROM notes
      WHERE user_id = ? AND created_at >= datetime('now', '${sqliteTimeModifier}')
    `).get(userId)?.count || 0;

    // মোট রিমাইন্ডার তৈরি
    const remindersCreated = db.prepare(`
      SELECT COUNT(*) as count FROM reminders
      WHERE user_id = ? AND created_at >= datetime('now', '${sqliteTimeModifier}')
    `).get(userId)?.count || 0;

    // সম্পন্নকৃত কাজ
    const tasksCompleted = db.prepare(`
      SELECT COUNT(*) as count FROM completed_tasks
      WHERE user_id = ? AND completed_at >= datetime('now', '${sqliteTimeModifier}')
    `).get(userId)?.count || 0;

    // পাঠানো রিমাইন্ডার
    const remindersSent = db.prepare(`
      SELECT COUNT(*) as count FROM reminder_completions
      WHERE user_id = ? AND created_at >= datetime('now', '${sqliteTimeModifier}')
    `).get(userId)?.count || 0;

    // অর্জিত পয়েন্ট
    const pointsEarned = db.prepare(`
      SELECT SUM(points_awarded) as total FROM completed_tasks
      WHERE user_id = ? AND completed_at >= datetime('now', '${sqliteTimeModifier}')
    `).get(userId)?.total || 0;

    // সর্বোচ্চ ক্যাটাগরি
    const topCategoryRow = db.prepare(`
      SELECT category, COUNT(*) as c FROM analytics_events
      WHERE user_id = ? AND created_at >= datetime('now', '${sqliteTimeModifier}') AND category != 'সাধারণ'
      GROUP BY category ORDER BY c DESC LIMIT 1
    `).get(userId);

    const totalTrackedTasks = remindersCreated + tasksCompleted;
    const completionRate = totalTrackedTasks > 0
      ? Math.min(100, Math.round((tasksCompleted / totalTrackedTasks) * 100))
      : (tasksCompleted > 0 ? 100 : 0);

    return {
      notesCount,
      remindersCreated,
      tasksCompleted,
      remindersSent,
      pointsEarned,
      completionRate,
      topCategory: topCategoryRow ? topCategoryRow.category : 'সাধারণ কাজ',
    };
  } catch (err) {
    console.error(`[PersonalReview] getTimeframeStats error (${sqliteTimeModifier}):`, err.message);
    return {
      notesCount: 0,
      remindersCreated: 0,
      tasksCompleted: 0,
      remindersSent: 0,
      pointsEarned: 0,
      completionRate: 0,
      topCategory: 'সাধারণ কাজ',
    };
  }
}

/**
 * ৪টি সময়সীমার (১ দিন, ৭ দিন, ১ মাস, ১ বছর) সমন্বিত পরিসংখ্যান
 */
function getMultiTimeframeSummary(userId) {
  const day1 = getTimeframeStats(userId, '-1 day');
  const day7 = getTimeframeStats(userId, '-7 days');
  const month1 = getTimeframeStats(userId, '-30 days');
  const year1 = getTimeframeStats(userId, '-365 days');

  return { day1, day7, month1, year1 };
}

/**
 * লাইভ Gemini API সহায়তায় পার্সোনাল রিভিউ ও ইমপ্রুভমেন্ট গাইড তৈরি
 */
async function generateAiReview(userId, summary, learnedProfile) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = [
      process.env.GEMINI_MODEL,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ].filter(Boolean);

    const prompt = `তুমি FREND — ব্যবহারকারীর বাংলা ব্যক্তিগত AI কোচ ও মেমরি অ্যাসিস্ট্যান্ট।
ব্যবহারকারীর বিগত ১ দিন, ৭ দিন, ১ মাস এবং ১ বছরের পরিসংখ্যান নিচে দেওয়া হলো:

[পরিসংখ্যান]:
১ দিন (২৪ ঘণ্টা): কাজ সম্পন্ন=${summary.day1.tasksCompleted}, রিমাইন্ডার=${summary.day1.remindersCreated}, নোট=${summary.day1.notesCount}, সফলতার হার=${summary.day1.completionRate}%
৭ দিন: কাজ সম্পন্ন=${summary.day7.tasksCompleted}, রিমাইন্ডার=${summary.day7.remindersCreated}, নোট=${summary.day7.notesCount}, সফলতার হার=${summary.day7.completionRate}%
১ মাস: কাজ সম্পন্ন=${summary.month1.tasksCompleted}, রিমাইন্ডার=${summary.month1.remindersCreated}, নোট=${summary.month1.notesCount}, সফলতার হার=${summary.month1.completionRate}%
১ বছর: কাজ সম্পন্ন=${summary.year1.tasksCompleted}, রিমাইন্ডার=${summary.year1.remindersCreated}, নোট=${summary.year1.notesCount}, সফলতার হার=${summary.year1.completionRate}%

[লোকাল লার্নিং ব্রেইন থেকে ব্যবহারকারী সম্পর্কে জানা তথ্য]:
${JSON.stringify(learnedProfile.categories)}

তোমার কাজ:
১. এই ৪টি সময়সীমার মধ্যে তুলনা করে একটি সংক্ষিপ্ত ও উৎসাহব্যঞ্জক "ব্যক্তিগত রিভিউ" লেখো।
২. "কোথায় কোথায় উন্নতি (Improvement) করা লাগবে" তার ৩টি স্পষ্ট পয়েন্ট দাও (যেমন সময়ানুবর্তিতা, স্ট্রিক, কাজের ভারসাম্য ইত্যাদি)।
৩. সরাসরি সুন্দর বাংলা WhatsApp ফরম্যাটে উত্তর দাও (মার্কডাউন এবং মানানসই ইমোজি সহ)।`;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await model.generateContent(prompt);
        return res.response.text().trim();
      } catch (_) {
        continue;
      }
    }
  } catch (err) {
    console.error('[PersonalReview] AI review error:', err.message);
  }
  return null;
}

/**
 * অফলাইন বা লোকাল অ্যালগরিদমিক পার্সোনাল রিভিউ ও ইমপ্রুভমেন্ট টিপস
 */
function generateLocalReview(summary, learnedProfile) {
  let review = `🔍 *পার্সোনাল পারফরম্যান্স মূল্যায়ন:*\n`;

  // ১ দিন বনাম ৭ দিন তুলনা
  if (summary.day1.tasksCompleted >= (summary.day7.tasksCompleted / 7)) {
    review += `• 📈 *আজকের গতি:* আজকের দিনটিতে তুমি সাপ্তাহিক গড় হারের চেয়ে বেশি সক্রিয় ছিলে। এই গতি ধরে রাখো!\n`;
  } else {
    review += `• 📉 *আজকের গতি:* আজকের সম্পন্ন কাজের গতি সাপ্তাহিক গড়ের চেয়ে কিছুটা ধীর। দিনের বাকি কাজগুলো গুছিয়ে নাও।\n`;
  }

  // ৭ দিন বনাম ১ মাস তুলনা
  if (summary.day7.completionRate >= summary.month1.completionRate) {
    review += `• 🌟 *সাপ্তাহিক ধারাবাহিকতা:* গত ৭ দিনে তোমার কাজের সফলতার হার (${summary.day7.completionRate}%) পুরো মাসের গড় হারের চেয়ে উন্নত!\n`;
  } else {
    review += `• ⏳ *সাপ্তাহিক গতিশীলতা:* গত ৭ দিনে কিছু কাজ জমে রয়েছে, দ্রুত শেষ করে স্ট্রিক বজায় রাখো।\n`;
  }

  review += `\n🎯 *যে যে জায়গায় উন্নতি (Improvement) করা লাগবে:*\n`;
  review += `১. ⏰ *সময়ানুবর্তিতা:* রিমাইন্ডার আসার সাথে সাথে কাজ শেষ করে "done" বা "শেষ" লিখলে কাজের তালিকা সবসময় ফ্রেশ থাকবে।\n`;
  review += `২. ⚖️ *কাজের ভারসাম্য:* শুধু কাজ নয়, নিজের স্বাস্থ্য ও বিশ্রামের জন্যও সমান রিমাইন্ডার ও নোট সেট করো।\n`;
  review += `৩. 📅 *সকালের পরিকল্পনা:* দিনের শুরুতেই ৩টি প্রধান কাজ নির্ধারণ করে নাও, এতে সারাদিনের কার্যক্ষমতা দ্বিগুণ হবে।\n`;

  return review;
}

/**
 * সম্পূর্ণ সামারি, তুলনা, পার্সোনাল রিভিউ এবং ইমপ্রুভমেন্ট রিপোর্ট তৈরি
 */
async function generateFullPersonalReview(userId, userName = 'বন্ধু') {
  const summary = getMultiTimeframeSummary(userId);
  const learnedProfile = localLearner.getUserProfile(userId);

  let output = `📊 *${userName}-এর পার্সোনাল সামারি ও প্রগ্রেস রিপোর্ট*\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // চার টাইমফ্রেমের টেবিল/ভিউ
  output += `🕒 *১. সময়সীমা ভিত্তিক কার্যক্রম:*\n\n`;

  // ১ দিন
  output += `📅 *গত ১ দিন (২৪ ঘণ্টা):*\n`;
  output += `   • সম্পন্ন কাজ: *${summary.day1.tasksCompleted}টি* | নোট: *${summary.day1.notesCount}টি*\n`;
  output += `   • সফলতার হার: *${summary.day1.completionRate}%* | অর্জিত XP: *+${summary.day1.pointsEarned}*\n\n`;

  // ৭ দিন
  output += `🗓️ *গত ৭ দিন (এক সপ্তাহ):*\n`;
  output += `   • সম্পন্ন কাজ: *${summary.day7.tasksCompleted}টি* | নোট: *${summary.day7.notesCount}টি*\n`;
  output += `   • সফলতার হার: *${summary.day7.completionRate}%* | অর্জিত XP: *+${summary.day7.pointsEarned}*\n\n`;

  // ১ মাস
  output += `📆 *গত ১ মাস (৩০ দিন):*\n`;
  output += `   • সম্পন্ন কাজ: *${summary.month1.tasksCompleted}টি* | নোট: *${summary.month1.notesCount}টি*\n`;
  output += `   • সফলতার হার: *${summary.month1.completionRate}%* | শীর্ষ বিষয়: *${summary.month1.topCategory}*\n\n`;

  // ১ বছর
  output += `🏛️ *গত ১ বছর (সামগ্রিক ইতিহাস):*\n`;
  output += `   • মোট সম্পন্ন কাজ: *${summary.year1.tasksCompleted}টি* | মোট নোট: *${summary.year1.notesCount}টি*\n`;
  output += `   • সার্বিক সফলতার হার: *${summary.year1.completionRate}%*\n\n`;

  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // লাইভ API রিভিউ চেষ্টা, নইলে নির্ভরযোগ্য লোকাল রিভিউ
  const aiReview = await generateAiReview(userId, summary, learnedProfile);
  if (aiReview) {
    output += `${aiReview}\n\n`;
  } else {
    output += `${generateLocalReview(summary, learnedProfile)}\n\n`;
  }

  output += `_💡 তোমার দৈনন্দিন ব্যবহারের সাথে সাথে লোকাল লার্নিং মডেল আরও নিখুঁত হচ্ছে!_`;
  return output;
}

module.exports = {
  getMultiTimeframeSummary,
  generateFullPersonalReview,
};
