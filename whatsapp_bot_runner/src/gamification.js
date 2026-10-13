/**
 * Gamification Module — Frend Bot
 * কাজ শেষ করলে পয়েন্ট (XP), লেভেল, স্ট্রিক এবং ব্যাজ পাওয়ার ব্যবস্থা।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));

// ─── Gamification Tables ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS user_gamification (
    user_id TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak_days INTEGER DEFAULT 0,
    last_active_date TEXT,
    tasks_completed INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_key TEXT NOT NULL,
    badge_name TEXT NOT NULL,
    badge_icon TEXT NOT NULL,
    description TEXT NOT NULL,
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_key)
  );

  CREATE TABLE IF NOT EXISTS completed_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    task_text TEXT NOT NULL,
    source TEXT DEFAULT 'reminder', -- 'reminder' | 'note' | 'custom'
    points_awarded INTEGER NOT NULL,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Badges Catalog ───────────────────────────────────────────
const BADGE_CATALOG = {
  first_step: {
    key: 'first_step',
    name: 'প্রথম পদক্ষেপ',
    icon: '🌟',
    description: 'প্রথম কোনো কাজ সফলভাবে সম্পন্ন করেছো!',
    check: (g) => g.tasks_completed >= 1,
  },
  task_5: {
    key: 'task_5',
    name: 'শুরুর ব্রোঞ্জ',
    icon: '🥉',
    description: '৫টি কাজ সফলভাবে সম্পন্ন করেছো।',
    check: (g) => g.tasks_completed >= 5,
  },
  task_15: {
    key: 'task_15',
    name: 'সিলভার স্টার',
    icon: '🥈',
    description: '১৫টি কাজ শেষ করে নিয়মনিষ্ঠার পরিচয় দিয়েছো।',
    check: (g) => g.tasks_completed >= 15,
  },
  task_30: {
    key: 'task_30',
    name: 'সোনার মাস্টার',
    icon: '🥇',
    description: '৩০টি কাজ শেষ করে একজন প্রোডাক্টিভিটি মাস্টার হয়েছো!',
    check: (g) => g.tasks_completed >= 30,
  },
  task_50: {
    key: 'task_50',
    name: 'হীরক কিংবদন্তি',
    icon: '💎',
    description: '৫০টি কাজ সম্পন্ন করে কিংবদন্তি হয়েছো!',
    check: (g) => g.tasks_completed >= 50,
  },
  streak_3: {
    key: 'streak_3',
    name: '৩ দিনের আগুন',
    icon: '🔥',
    description: 'পরপর ৩ দিন একটানা স্ট্রিক বজায় রেখেছো!',
    check: (g) => g.streak_days >= 3,
  },
  streak_7: {
    key: 'streak_7',
    name: 'সাপ্তাহিক যোদ্ধা',
    icon: '⚡',
    description: 'একটানা ৭ দিনের পারফেক্ট স্ট্রিক!',
    check: (g) => g.streak_days >= 7,
  },
  level_5: {
    key: 'level_5',
    name: 'প্রোডাক্টিভিটি কিং',
    icon: '👑',
    description: 'লেভেল ৫ অর্জন করেছো!',
    check: (g) => g.level >= 5,
  },
  early_bird: {
    key: 'early_bird',
    name: 'ভোরের পাখি',
    icon: '🌅',
    description: 'সকাল ৬টা থেকে ৯টার মধ্যে কাজ সম্পন্ন করেছো।',
    check: (_, meta) => meta && meta.hour >= 6 && meta.hour <= 9,
  },
  night_owl: {
    key: 'night_owl',
    name: 'রাতের পেঁচা',
    icon: '🦉',
    description: 'রাত ১১টা থেকে ৩টার মধ্যে কাজ সম্পন্ন করেছো।',
    check: (_, meta) => meta && (meta.hour >= 23 || meta.hour <= 3),
  },
};

// ─── Level Calculation ────────────────────────────────────────
// 0-49 XP = Level 1, 50-119 XP = Level 2, 120-209 = Level 3, etc.
function calculateLevel(points) {
  return Math.floor(Math.sqrt(points / 20)) + 1;
}

function getLevelProgress(points) {
  const currentLevel = calculateLevel(points);
  const currentLevelMin = (currentLevel - 1) * (currentLevel - 1) * 20;
  const nextLevelMin = currentLevel * currentLevel * 20;
  const range = nextLevelMin - currentLevelMin;
  const progressInLevel = points - currentLevelMin;
  const percent = Math.min(100, Math.max(0, Math.round((progressInLevel / range) * 100)));
  return { currentLevel, nextLevelMin, progressInLevel, range, percent };
}

function getProgressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return '▓'.repeat(filled) + '░'.repeat(Math.max(0, length - filled));
}

// ─── Get or Init User Gamification ─────────────────────────────
function getUserGamification(userId) {
  let record = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);
  if (!record) {
    db.prepare(`
      INSERT INTO user_gamification (user_id, points, level, streak_days, last_active_date, tasks_completed)
      VALUES (?, 0, 1, 0, NULL, 0)
    `).run(userId);
    record = db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').get(userId);
  }
  return record;
}

// ─── Check & Award Badges ─────────────────────────────────────
function checkBadges(userId, gamificationState, meta = {}) {
  const unlockedBadges = [];
  const existingBadges = new Set(
    db.prepare('SELECT badge_key FROM user_badges WHERE user_id = ?').all(userId).map(b => b.badge_key)
  );

  for (const [key, badge] of Object.entries(BADGE_CATALOG)) {
    if (!existingBadges.has(key)) {
      if (badge.check(gamificationState, meta)) {
        db.prepare(`
          INSERT INTO user_badges (user_id, badge_key, badge_name, badge_icon, description)
          VALUES (?, ?, ?, ?, ?)
        `).run(userId, key, badge.name, badge.icon, badge.description);

        unlockedBadges.push(badge);
        // Bonus points for badge
        db.prepare('UPDATE user_gamification SET points = points + 30 WHERE user_id = ?').run(userId);
      }
    }
  }

  return unlockedBadges;
}

// ─── Complete a Task ──────────────────────────────────────────
function completeTask(userId, taskText, source = 'custom') {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const hour = now.getHours();

  const current = getUserGamification(userId);
  let streak = current.streak_days;
  let streakBonus = 0;

  // Streak logic
  if (!current.last_active_date) {
    streak = 1;
    streakBonus = 5;
  } else if (current.last_active_date === todayStr) {
    // Already active today, streak stays
  } else {
    const lastDate = new Date(current.last_active_date);
    const diffDays = Math.round((now - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak += 1;
      streakBonus = Math.min(25, streak * 5); // streak bonus
    } else {
      streak = 1;
      streakBonus = 5;
    }
  }

  const basePoints = 15;
  const totalAwarded = basePoints + streakBonus;
  const newTasksCompleted = current.tasks_completed + 1;
  const newPoints = current.points + totalAwarded;
  const newLevel = calculateLevel(newPoints);
  const leveledUp = newLevel > current.level;

  // Update DB
  db.prepare(`
    UPDATE user_gamification
    SET points = ?, level = ?, streak_days = ?, last_active_date = ?, tasks_completed = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(newPoints, newLevel, streak, todayStr, newTasksCompleted, userId);

  // Record completed task
  db.prepare(`
    INSERT INTO completed_tasks (user_id, task_text, source, points_awarded)
    VALUES (?, ?, ?, ?)
  `).run(userId, taskText, source, totalAwarded);

  // Check badges
  const updatedState = {
    ...current,
    points: newPoints,
    level: newLevel,
    streak_days: streak,
    tasks_completed: newTasksCompleted,
  };
  const newBadges = checkBadges(userId, updatedState, { hour });

  return {
    taskText,
    pointsAwarded: totalAwarded,
    basePoints,
    streakBonus,
    totalPoints: newPoints,
    level: newLevel,
    leveledUp,
    streak,
    newBadges,
  };
}

// ─── Get User Profile ─────────────────────────────────────────
function getUserProfile(userId) {
  const gamification = getUserGamification(userId);
  const badges = db.prepare('SELECT * FROM user_badges WHERE user_id = ? ORDER BY unlocked_at DESC').all(userId);
  const recentCompleted = db.prepare(
    'SELECT * FROM completed_tasks WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5'
  ).all(userId);
  const progress = getLevelProgress(gamification.points);

  return {
    ...gamification,
    badges,
    recentCompleted,
    progress,
  };
}

// ─── Format Profile Card for WhatsApp ─────────────────────────
function formatProfileCard(userId, userName = '') {
  const profile = getUserProfile(userId);
  const name = userName ? ` — *${userName.split(' ')[0]}*` : '';
  const bar = getProgressBar(profile.progress.percent, 8);

  let badgesText = 'কোনো ব্যাজ এখনো অর্জন হয়নি। কাজ শেষ করে ব্যাজ আনলক করো!';
  if (profile.badges.length > 0) {
    badgesText = profile.badges.map(b => `${b.badge_icon} *${b.badge_name}*`).join('  ');
  }

  let streakEmoji = '🌱';
  if (profile.streak_days >= 7) streakEmoji = '⚡';
  else if (profile.streak_days >= 3) streakEmoji = '🔥';

  return (
    `🎮 *ফ্রেন্ড গ্যামিফিকেশন প্রোফাইল*${name}\n\n` +
    `⭐ *লেভেল ${profile.level}*  ·  ✨ *${profile.points} XP*\n` +
    `[${bar}] ${profile.progress.percent}%\n` +
    `_পরের লেভেলের জন্য আরো ${profile.progress.nextLevelMin - profile.points} XP দরকার_\n\n` +
    `${streakEmoji} *বর্তমান স্ট্রিক:* ${profile.streak_days} দিন একটানা\n` +
    `✅ *মোট সম্পন্ন কাজ:* ${profile.tasks_completed}টি\n\n` +
    `🏆 *অর্জিত ব্যাজসমূহ (${profile.badges.length}টি):*\n` +
    `${badgesText}\n\n` +
    `💡 _কাজ শেষ করে লিখো: *শেষ [নম্বর]* বা *done [নম্বর]*_\n` +
    `_প্রতি কাজে পাবে +১৫ XP ও স্ট্রিক বোনাস!_`
  );
}

// ─── Format Badges Showcase ───────────────────────────────────
function formatBadgesShowcase(userId) {
  const userBadges = new Set(
    db.prepare('SELECT badge_key FROM user_badges WHERE user_id = ?').all(userId).map(b => b.badge_key)
  );

  let list = '';
  for (const [key, badge] of Object.entries(BADGE_CATALOG)) {
    const unlocked = userBadges.has(key);
    const status = unlocked ? '✅ *আনলকড*' : '🔒 _লকড_';
    list += `${badge.icon} *${badge.name}* [${status}]\n   ${badge.description}\n\n`;
  }

  return (
    `🏆 *ফ্রেন্ড ব্যাজ শোকেস:*\n\n` +
    `${list.trim()}\n\n` +
    `_কাজ সম্পন্ন করতে থাকো আর নতুন নতুন ব্যাজ আনলক করো!_ 🚀`
  );
}

module.exports = {
  completeTask,
  getUserGamification,
  getUserProfile,
  formatProfileCard,
  formatBadgesShowcase,
  calculateLevel,
  getLevelProgress,
  BADGE_CATALOG,
};
