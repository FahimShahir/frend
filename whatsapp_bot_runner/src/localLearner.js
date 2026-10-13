/**
 * Local Learner & Continuous Memory Profile Engine — FREND
 * ব্যবহারকারীর মেসেজ, রুটিন, অভ্যাস এবং পছন্দ সম্পর্কে স্বয়ংক্রিয়ভাবে শেখে।
 * অফলাইনে সম্পূর্ণ লোকাল রুল দিয়ে চলে, এবং লাইভ Gemini API থাকলে আরও গভীর ইনসাইট বের করে।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const dbPath = path.join(__dirname, '..', 'data', 'frend.db');
const db = new Database(dbPath);

// ─── Local Learning Tables ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS user_learned_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    category TEXT NOT NULL, -- 'health' | 'work' | 'routine' | 'preference' | 'personal_fact'
    fact_key TEXT NOT NULL,
    fact_value TEXT NOT NULL,
    evidence TEXT DEFAULT '',
    confidence REAL DEFAULT 1.0,
    occurrence_count INTEGER DEFAULT 1,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, fact_key)
  );

  CREATE TABLE IF NOT EXISTS user_behavior_patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    pattern_type TEXT NOT NULL, -- 'active_time' | 'completion_speed' | 'frequent_topic'
    details TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    last_detected DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * লোকাল নলেজ বেসে তথ্য যুক্ত বা আপডেট করে
 */
function recordFact(userId, category, factKey, factValue, evidence = '') {
  try {
    const existing = db.prepare(
      'SELECT id, occurrence_count FROM user_learned_knowledge WHERE user_id = ? AND fact_key = ?'
    ).get(userId, factKey);

    if (existing) {
      db.prepare(`
        UPDATE user_learned_knowledge
        SET fact_value = ?, evidence = ?, occurrence_count = occurrence_count + 1, last_updated = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(factValue, evidence, existing.id);
    } else {
      db.prepare(`
        INSERT INTO user_learned_knowledge (user_id, category, fact_key, fact_value, evidence)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, category, factKey, factValue, evidence);
    }
  } catch (err) {
    console.error('[LocalLearner] recordFact error:', err.message);
  }
}

/**
 * অফলাইন রুল-বেসড লার্নিং (১০০% লোকাল)
 */
function learnFromLocalRules(userId, text) {
  if (!text || text.length < 3) return;
  const lower = text.toLowerCase();
  const now = new Date();
  const hour = now.getHours();

  // ১. স্বাস্থ্য ও ওষুধ
  if (/ওষুধ|ঔষধ|ট্যাবলেট|tablet|capsule|নাপা|ডাক্তার|প্রেসক্রিপশন/i.test(lower)) {
    recordFact(userId, 'health', 'regular_medicine_user', 'ব্যবহারকারী নিয়মিত স্বাস্থ্য বা ওষুধ সচেতন', text);
  }

  // ২. কাজের ধরন ও ক্যারিয়ার
  if (/কোডিং|প্রোগ্রামিং|software|developer|কোড|github|bug|লারাভেল|laravel|node|api/i.test(lower)) {
    recordFact(userId, 'work', 'profession_field', 'সফটওয়্যার ডেভেলপমেন্ট ও প্রযুক্তি সংক্রান্ত কাজে যুক্ত', text);
  } else if (/ক্লাস|পড়া|পরীক্ষা|exam|study|university|কলেজ|ভার্সিটি/i.test(lower)) {
    recordFact(userId, 'work', 'student_life', 'পড়াশোনা বা পরীক্ষার ব্যস্ততা রয়েছে', text);
  } else if (/অফিস|মিটিং|ক্লায়েন্ট|client|meeting|প্রজেক্ট|office/i.test(lower)) {
    recordFact(userId, 'work', 'office_routine', 'অফিস প্রজেক্ট ও ক্লায়েন্ট মিটিং নিয়মিত থাকে', text);
  }

  // ৩. দৈনিক রুটিন (সময় সচেতনতা)
  if (hour >= 23 || hour < 5) {
    recordFact(userId, 'routine', 'late_night_active', 'গভীর রাত পর্যন্ত সক্রিয় থাকার অভ্যাস রয়েছে', `সক্রিয় সময়: ${hour}:00`);
  } else if (hour >= 6 && hour <= 8) {
    recordFact(userId, 'routine', 'early_riser', 'সকাল সকাল দিন শুরু করার অভ্যাস রয়েছে', `সক্রিয় সময়: ${hour}:00`);
  }

  // ৪. কেনাকাটা বা আর্থিক অভ্যাস
  if (/বাজার|কেনাকাটা|shopping|টাকা|বিল|পেমেন্ট|payment|bank/i.test(lower)) {
    recordFact(userId, 'preference', 'finance_conscious', 'বাজার ও বিল নিয়মিত হিসাব রাখেন', text);
  }
}

/**
 * লাইভ Gemini API সহায়তায় গভীর সেলফ-লার্নিং
 */
async function learnWithLiveApi(userId, text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text || text.length < 8) return;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const models = [
      process.env.GEMINI_MODEL,
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ].filter(Boolean);

    const prompt = `তুমি FREND-এর লোকাল লার্নিং ব্রেইন। ব্যবহারকারীর নিচের মেসেজটি বিশ্লেষণ করে তার জীবনযাপন, অভ্যাস, পছন্দ বা ব্যক্তিগত তথ্য সম্পর্কে কিছু জানা যায় কিনা বলো।
মেসেজ: "${text}"

যদি নতুন কোনো তথ্য জানা যায়, তাহলে এই JSON আউটপুট দাও:
{
  "hasFact": true,
  "category": "health|work|routine|preference|personal_fact",
  "factKey": "unique_key_in_english_snake_case",
  "factValue": "বাংলায় এক লাইনে ব্যবহারকারী সম্পর্কে কী শিখলে"
}

যদি নতুন কোনো তথ্য না থাকে:
{"hasFact": false}

শুধু JSON দাও।`;

    for (const modelName of models) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await model.generateContent(prompt);
        const raw = res.response.text().trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.hasFact && parsed.category && parsed.factKey && parsed.factValue) {
            recordFact(userId, parsed.category, parsed.factKey, parsed.factValue, text);
          }
        }
        break;
      } catch (_) {
        continue;
      }
    }
  } catch (err) {
    // Silent fail for background learning
  }
}

/**
 * ব্যবহারকারীর প্রতি মেসেজে স্বয়ংক্রিয় লার্নিং ট্রিগার
 */
function learnFromInteraction(userId, text) {
  // ১. লোকাল রুল সবসময় ইনস্ট্যান্ট কাজ করবে (০ মিলিসেকেন্ড ল্যাগ)
  learnFromLocalRules(userId, text);

  // ২. লাইভ API ব্যাকগ্রাউন্ডে অ্যাসিনক্রোনাসলি শেখে (চ্যাটে কোনো বিলম্ব ঘটায় না)
  setTimeout(() => {
    learnWithLiveApi(userId, text).catch(() => {});
  }, 100);
}

/**
 * ব্যবহারকারী সম্পর্কে এ পর্যন্ত শেখা সমস্ত তথ্য নিয়ে আসা
 */
function getUserProfile(userId) {
  try {
    const facts = db.prepare(
      'SELECT category, fact_key, fact_value, occurrence_count, last_updated FROM user_learned_knowledge WHERE user_id = ? ORDER BY occurrence_count DESC'
    ).all(userId);

    const categories = {
      health: [],
      work: [],
      routine: [],
      preference: [],
      personal_fact: [],
    };

    facts.forEach(f => {
      if (categories[f.category]) {
        categories[f.category].push(f.fact_value);
      } else {
        categories.personal_fact.push(f.fact_value);
      }
    });

    return {
      totalFacts: facts.length,
      categories,
      rawFacts: facts,
    };
  } catch (err) {
    console.error('[LocalLearner] getUserProfile error:', err.message);
    return { totalFacts: 0, categories: {}, rawFacts: [] };
  }
}

/**
 * ফরম্যাটেড লোকাল নলেজ ভিউ
 */
function formatLearnedProfileMessage(userId) {
  const profile = getUserProfile(userId);
  if (profile.totalFacts === 0) {
    return (
      `🧠 *লোকাল লার্নিং মডেল:*\n\n` +
      `আমি এখনও তোমার সম্পর্কে শিখছি। তুমি যখন মেসেজ পাঠাবে, রিমাইন্ডার সেট করবে বা কাজ শেষ করবে, আমি তোমার অভ্যাস ও পছন্দ মনে রাখব!`
    );
  }

  let msg = `🧠 *তোমার সম্পর্কে আমি যা যা শিখেছি:*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (profile.categories.routine && profile.categories.routine.length > 0) {
    msg += `🕒 *দৈনিক রুটিন ও সময়:* \n`;
    profile.categories.routine.forEach(f => { msg += `• ${f}\n`; });
    msg += `\n`;
  }

  if (profile.categories.work && profile.categories.work.length > 0) {
    msg += `💼 *কাজ ও কর্মক্ষেত্র:* \n`;
    profile.categories.work.forEach(f => { msg += `• ${f}\n`; });
    msg += `\n`;
  }

  if (profile.categories.health && profile.categories.health.length > 0) {
    msg += `❤️ *স্বাস্থ্য ও সতর্কতা:* \n`;
    profile.categories.health.forEach(f => { msg += `• ${f}\n`; });
    msg += `\n`;
  }

  if (profile.categories.preference && profile.categories.preference.length > 0) {
    msg += `⭐ *পছন্দ ও অগ্রাধিকার:* \n`;
    profile.categories.preference.forEach(f => { msg += `• ${f}\n`; });
    msg += `\n`;
  }

  msg += `_এই তথ্যগুলো সম্পূর্ণ তোমার ডিভাইসের লোকাল ডেটাবেজে সংরক্ষিত এবং সময়ের সাথে সাথে বট আরও নিখুঁত হচ্ছে!_ 👍`;
  return msg;
}

module.exports = {
  learnFromInteraction,
  recordFact,
  getUserProfile,
  formatLearnedProfileMessage,
};
