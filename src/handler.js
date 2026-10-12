/**
 * Message handler — parses incoming WhatsApp messages and returns a response.
 * Supports Bengali and mixed Bengali-English commands.
 * v2: Smart AI Reminders + Google Calendar + Location Reminders
 */

'use strict';

const db = require('./database');
const { parseTime, formatTime, formatRelativeTime, convertBnDigits } = require('./timeParser');
const { analyzeForSmartReminder, understandConversationalIntent } = require('./aiAnalyzer');
const calendarSync = require('./calendarSync');
const locationDb = require('./locationReminder');
const analytics = require('./analytics');
const gamification = require('./gamification');
const calendarView = require('./calendarView');
const smartTiming = require('./smartTiming');
// webDashboard is required lazily to eliminate circular dependencies
let _webDashboard = null;
function getWebDashboard() {
  if (!_webDashboard) _webDashboard = require('./webDashboard');
  return _webDashboard;
}
const cloudBackup = require('./cloudBackup');
const localLearner = require('./localLearner');
const personalReview = require('./personalReview');
const { resolveTargetResource, executeUniversalAction } = require('./universalActionEngine');
const selfHealingEngine = require('./selfHealingEngine');
const capabilityRegistry = require('./capabilityRegistry');
const security = require('./security');

// ─── Intents ─────────────────────────────────────────────────
const INTENTS = {
  SAVE_NOTE: [
    /^মনে\s*রাখ[ো]?[:\s]/i,
    /^সেভ\s*কর[ো]?[:\s]/i,
    /^note[:\s]/i,
    /^save[:\s]/i,
    /^লিখে\s*রাখ[ো]?[:\s]/i,
    /^রেখে\s*দে[ও]?[:\s]/i,
    /^(?:note\s*add|add\s*note|save\s*note)[:\s]/i,
    /^(?:mone\s*rakh|mone\s*rakho|mone\s*rakhis)[:\s]/i,
    /^(?:likhe\s*rakh|likhe\s*rakho)[:\s]/i,
    /^(?:save\s*koro|save\s*kor)[:\s]/i,
  ],
  REMINDER: [
    /^মনে\s*করিয়ে\s*দে/i,
    /^রিমাইন্ডার[:\s]/i,
    /^reminder[:\s]/i,
    /^মনে\s*করা[ও]?[:\s]/i,
    /^মনে\s*করিয়ে\s*দিও/i,
    /^alarm[:\s]/i,
    /^(?:mone\s*koraio|mone\s*koria\s*dio|mone\s*koriye\s*dio|remind\s*me)[:\s]/i,
    /^(?:reminder\s*dao|reminder\s*set)[:\s]/i,
    /^(?:alarm\s*dao|alarm\s*set)[:\s]/i,
  ],
  LIST_NOTES: [
    /^কী\s*মনে\s*রাখ/i,
    /^কি\s*মনে\s*রাখ/i,
    /^সব\s*নোট/i,
    /^নোট\s*দেখা/i,
    /^আমার\s*নোট/i,
    /^list/i,
    /^দেখা/i,
    /^সব\s*দেখ/i,
    /^(?:sob\s*note|amr\s*note|amar\s*note|note\s*list|show\s*notes|list\s*notes|notes\s*dekhaw|ki\s*mone\s*rakhso)/i,
  ],
  SEARCH: [
    /^খুঁজে?\s*দে[ও]?/i,
    /^খোঁজ[:\s]/i,
    /^search[:\s]/i,
    /^find[:\s]/i,
    /^খুঁজ[:\s]/i,
  ],
  DELETE: [
    /(?:ডিলিট|delete|রিমুভ|remove)/i,
    /(?:মুছে?\s*(?:দে[ও]?|ফেল[ো]?|কর[ো]?|দাও))/i,
    /(?:ভুলে?\s*যা[ও]?)/i,
    /(?:বাতিল\s*(?:কর[ো]?|হবে|দাও))/i,
    /(?:হটা[ও]?)/i,
    /(?:কেটে?\s*(?:দে[ও]?|ফেল[ো]?|দাও))/i,
    /(?:muche\s*(?:dao|felo|koro)|muchhe\s*(?:dao|felo))/i,
    /(?:bhule\s*(?:jao|ja)|bad\s*dao)/i,
    /^ডিলিট/i,
    /^delete/i,
    /^remove/i,
    /^মুছে/i,
    /^ভুলে/i,
    /^বাতিল/i,
  ],
  REMINDERS_LIST: [
    /^রিমাইন্ডার\s*দেখ/i,
    /^আমার\s*রিমাইন্ডার/i,
    /^কী\s*রিমাইন্ডার/i,
    /^reminders/i,
    /^(?:reminder\s*dekhaw|amr\s*reminder|amar\s*reminders|reminders\s*list|ki\s*ki\s*reminder)/i,
  ],
  CANCEL_REMINDER: [
    /^রিমাইন্ডার\s*বাতিল/i,
    /^cancel\s*reminder/i,
    /^(?:reminder\s*cancel|reminder\s*delete)/i,
  ],
  UNDO: [
    /^(?:undo|revert|আগের\s*(?:কাজটা|টা)?\s*undo|পূর্বের\s*অবস্থায়|ফিরিয়ে\s*আন[ো]?|ভুল\s*হয়েছে\s*ফিরিয়ে\s*দাও)/i,
    /^(?:ager\s*ta\s*undo|undo\s*koro|undo\s*kor)/i,
    /^undo$/i,
  ],
  UPDATE: [
    /^(?:edit|update|shorten|rename)[:\s]/i,
    /(?:এডিট|update|সম্পাদনা|পরিবর্তন|ছোট\s*কর[ো]?|shorten|বড়\s*কর[ো]?|যোগ\s*কর[ো]?|বদলা[ও]?)/i,
    /\badd\b.*(?:\bto\s+(?:it|this|that|note)|items?)/i,
    /(?:make\s*it\s*shorter|change\s*(?:the\s*)?(?:title|name))/i,
    /^(?:edit|update|shorten)$/i,
  ],
  LOCATION_SAVE: [
    /^লোকেশন\s*রিমাইন্ডার[:\s]/i,
    /^জায়গায়\s*গেলে[:\s]/i,
    /^গেলে\s*মনে\s*করিও?[:\s]/i,
    /^location\s*reminder[:\s]/i,
  ],
  LOCATION_LIST: [
    /^লোকেশন\s*রিমাইন্ডার\s*দেখ/i,
    /^আমার\s*লোকেশন/i,
    /^location\s*reminders/i,
  ],
  CALENDAR_SETUP: [
    /^গুগল\s*ক্যালেন্ডার\s*যুক্ত/i,
    /^calendar\s*setup/i,
    /^google\s*calendar/i,
    /^ক্যালেন্ডার\s*সেটআপ/i,
  ],
  AI_CONFIRM: [
    /^হ্যাঁ$/i,
    /^হ্যা$/i,
    /^yes$/i,
    /^ok$/i,
    /^ঠিক\s*আছে/i,
    /^দাও$/i,
    /^করো$/i,
    /^সেট\s*করো/i,
  ],
  AI_DECLINE: [
    /^না$/i,
    /^নাহ$/i,
    /^no$/i,
    /^দরকার\s*নেই/i,
    /^থাক$/i,
  ],
  CALENDAR_WEEK: [
    /^সাপ্তাহিক\s*ক্যালেন্ডার/i,
    /^week\s*view/i,
    /^সপ্তাহ/i,
    /^week$/i,
  ],
  CALENDAR_MONTH: [
    /^মাসিক\s*ক্যালেন্ডার/i,
    /^ক্যালেন্ডার\s*ভিউ/i,
    /^ক্যালেন্ডার$/i,
    /^calendar$/i,
    /^month\s*view/i,
    /^month$/i,
    /^মাসিক/i,
  ],
  REPORT: [
    /^সাপ্তাহিক\s*রিপোর্ট/i,
    /^রিপোর্ট/i,
    /^report/i,
    /^বিশ্লেষণ/i,
    /^analysis/i,
  ],
  INSIGHTS: [
    /^ইনসাইট/i,
    /^insight/i,
    /^অভ্যাস/i,
    /^পরামর্শ/i,
    /^টিপস/i,
  ],
  STATS: [
    /^স্ট্যাটস/i,
    /^stats/i,
    /^হিসাব/i,
  ],
  SUMMARY_REVIEW: [
    /^(?:আমার\s*)?সামারি/i,
    /^summary/i,
    /^(?:আমার\s*)?রিভিউ/i,
    /^review/i,
    /^পার্সোনাল\s*রিভিউ/i,
    /^ব্যক্তিগত\s*রিভিউ/i,
    /^কোথায়\s*ইমপ্রুভ/i,
    /^কী\s*ইমপ্রুভ/i,
    /^উন্নতি/i,
    /^ইমপ্রুভমেন্ট/i,
    /^প্রগ্রেস/i,
  ],
  LEARNED_PROFILE: [
    /^(?:আমার\s*সম্পর্কে\s*)?কী\s*শিখ(?:েছ|ল)/i,
    /^আমার\s*অভ্যাস/i,
    /^লোকাল\s*মডেল/i,
    /^learn/i,
    /^প্রোফাইল/i,
  ],
  TASK_DONE: [
    /^(?:কাজ\s*)?শেষ[:\s]?/i,
    /^done[:\s]?/i,
    /^complete[:\s]?/i,
    /^সম্পন্ন[:\s]?/i,
    /^করেছি[:\s]?/i,
    /^(?:kaj\s*sesh|kaj\s*ses|kora\s*sesh|korsi|korechi)[:\s]?/i,
    /শেষ$/i,
    /হয়ে\s*গেছে$/i,
    /হয়ে\s*গেছে$/i,
    /করে\s*ফেলেছি$/i,
    /করেছি$/i,
    /সম্পন্ন$/i,
    /done$/i,
    /completed$/i,
    /sesh$/i,
    /ses$/i,
  ],
  GAMIFY_PROFILE: [
    /^পয়েন্ট/i,
    /^পয়েন্ট/i,
    /^xp/i,
    /^লেভেল/i,
    /^level/i,
    /^স্কোর/i,
    /^score/i,
    /^প্রোফাইল/i,
    /^profile/i,
    /^স্ট্রিক/i,
    /^streak/i,
  ],
  BADGES_LIST: [
    /^ব্যাজ/i,
    /^badge/i,
    /^অর্জিত/i,
  ],
  SMART_TIMING: [
    /^স্মার্ট\s*সময়/i,
    /^smart\s*timing/i,
    /^টাইমিং/i,
    /^কখন\s*কাজ/i,
    /^পিক\s*সময়/i,
  ],
  MULTI_DEVICE_SYNC: [
    /^সিঙ্ক/i,
    /^sync/i,
    /^মাল্টি\s*ডিভাইস/i,
    /^multi\s*device/i,
    /^ওয়েব/i,
    /^web$/i,
    /^dashboard/i,
    /^ড্যাশবোর্ড/i,
  ],
  BACKUP: [
    /^ক্লাউড\s*ব্যাকআপ/i,
    /^ব্যাকআপ/i,
    /^backup/i,
    /^cloud\s*backup/i,
    /^ড্রাইভ\s*ব্যাকআপ/i,
    /^ড্রাইভ/i,
    /^drive/i,
    /^গুগল\s*ড্রাইভ/i,
    /^google\s*drive/i,
    /^ওয়ানড্রাইভ/i,
    /^onedrive/i,
  ],
  RESTORE: [
    /^রিস্টোর/i,
    /^restore/i,
  ],
  HELP: [
    /^সাহায্য/i,
    /^help/i,
    /^হেল্প/i,
    /^কমান্ড/i,
    /^কী\s*করতে\s*পারি/i,
  ],
  GREET: [
    /^হ্যালো/i,
    /^হেলো/i,
    /^হাই/i,
    /^নমস্কার/i,
    /^আস্সালামু/i,
    /^কেমন\s*আছ/i,
    /^hello/i,
    /^hi$/i,
  ],
};

// Per-user pending AI suggestion state (in-memory)
const pendingAiSuggestions = new Map();

function detectIntent(text) {
  for (const [intent, patterns] of Object.entries(INTENTS)) {
    if (patterns.some(p => p.test(text.trim()))) {
      return intent;
    }
  }
  return 'UNKNOWN';
}

function extractAfterKeyword(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return text.slice(match.index + match[0].length).trim();
    }
  }
  return text.trim();
}

function formatNote(note, index) {
  const date = new Date(note.created_at + 'Z');
  const dateStr = date.toLocaleDateString('bn-BD', {
    timeZone: 'Asia/Dhaka',
    month: 'short',
    day: 'numeric',
  });
  return `*${index}.* ${note.content}\n   _📅 ${dateStr} · #${note.id}_`;
}

async function setReminderAndCalendar(userId, content, time) {
  const id = db.saveReminder(userId, content, time);
  const relTime = formatRelativeTime(time);
  const absTime = formatTime(time);

  let calendarMsg = '';
  if (calendarSync.isConfigured() || calendarSync.getUserAuthClient(userId)) {
    const calRes = await calendarSync.addToGoogleCalendar(userId, content, time).catch(() => null);
    if (calRes) {
      calendarMsg = `\n📅 _Google Calendar-এ যুক্ত হয়েছে!_`;
      if (typeof calRes === 'object' && calRes.eventId) {
        db.updateReminderGoogleEventId(id, calRes.eventId);
      }
    }
  }

  return (
    `⏰ *রিমাইন্ডার সেট হয়েছে!*\n\n` +
    `📌 ${content}\n` +
    `🕐 ${relTime} (${absTime})` +
    calendarMsg +
    `\n\n_রিমাইন্ডার নম্বর: #${id}_`
  );
}

// ─── Unified Intelligent Delete Engine ────────────────────────
async function executeDelete(userId, text, parsedAi = null) {
  let targetRef = text;
  let resourceType = (parsedAi && parsedAi.resourceType) ? parsedAi.resourceType : 'note';
  if (/রিমাইন্ডার|reminder/i.test(text)) resourceType = 'reminder';
  if (/সব|all|sob/i.test(text) || (parsedAi && parsedAi.targetRef === 'all')) targetRef = 'all';
  if (parsedAi && parsedAi.targetRef) targetRef = parsedAi.targetRef;

  return await executeUniversalAction(userId, '', {
    intent: 'delete',
    resourceType,
    targetRef,
  });
}

// ─── Main Handler with Autonomous Self-Healing Guard ──────────
async function handleMessage(userId, userName, rawText) {
  const text = (rawText || '').trim();
  if (!text) return null;

  db.getOrCreateUser(userId, userName);

  // Trigger continuous autonomous learning on user message
  localLearner.learnFromInteraction(userId, text);

  // 1. Dynamic Capability Preemptive Route (Self-Healing Intent Protection)
  const preemptiveCap = selfHealingEngine.checkPreemptiveRoute(text);
  if (preemptiveCap) {
    try {
      const capId = typeof preemptiveCap === 'string' ? preemptiveCap : preemptiveCap.id;
      const res = await capabilityRegistry.executeCapability(capId, { userId, userName, text });
      // Record autonomous prevention & routing event in persistent diagnostic logs
      const errorId = 'HEAL_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      db.logDiagnosticEvent({
        errorId,
        userId,
        category: capId,
        originalIntent: capId,
        userMessage: security.scrubSecrets(text),
        rootCause: 'Dynamic capability matched and routed before keyword collision occurred.',
        correctiveAction: `Preemptively routed to capability: ${capId}`,
        testResults: 'Capability executed successfully.',
        status: 'HEALED',
        metadata: { capabilityId: capId }
      });
      return res;
    } catch (capErr) {
      console.warn('[Handler] Preemptive execution fallback:', capErr.message);
    }
  }

  // 2. Core Handler Pipeline with Self-Healing Diagnostic Guard
  const intent = detectIntent(text);
  try {
    const rawReply = await internalRouteMessage(userId, userName, text, intent);
    return await selfHealingEngine.diagnoseAndHeal({
      userId,
      userName,
      userMessage: text,
      attemptedIntent: intent,
      initialReply: rawReply,
      error: null
    });
  } catch (err) {
    return await selfHealingEngine.diagnoseAndHeal({
      userId,
      userName,
      userMessage: text,
      attemptedIntent: intent,
      initialReply: null,
      error: err
    });
  }
}

async function internalRouteMessage(userId, userName, text, intent) {

  // ── AI Confirmation (pending suggestion) ──
  if (pendingAiSuggestions.has(userId)) {
    const pending = pendingAiSuggestions.get(userId);
    if (intent === 'AI_CONFIRM') {
      pendingAiSuggestions.delete(userId);
      if (pending.targetDate) {
        return await setReminderAndCalendar(userId, pending.eventText, pending.targetDate);
      }
      const time = parseTime(pending.timeHint || 'কাল');
      if (time) {
        return await setReminderAndCalendar(userId, pending.eventText, time);
      }
      // No time parsed, save as note
      const id = db.saveNote(userId, pending.eventText);
      return `✅ নোট হিসেবে সেভ করলাম!\n📝 ${pending.eventText}\n_#${id}_`;
    } else if (intent === 'AI_DECLINE') {
      pendingAiSuggestions.delete(userId);
      return `ঠিক আছে, রাখা হলো না। 👍`;
    }
    // User typed something else, clear pending
    pendingAiSuggestions.delete(userId);
  }

  // ── GREET ──
  if (intent === 'GREET') {
    const stats = db.getUserStats(userId);
    const name = userName ? ` ${userName.split(' ')[0]}` : '';
    return (
      `*হেই${name}! আমি ফ্রেন্ড* 👋\n\n` +
      `তোমার কাছে এখন আছে:\n` +
      `📝 *${stats.totalNotes}টি নোট*\n` +
      `⏰ *${stats.activeReminders}টি রিমাইন্ডার*\n\n` +
      `কী মনে রাখতে চাও? বলো! 😊`
    );
  }

  // ── HELP ──
  if (intent === 'HELP') {
    analytics.trackEvent(userId, 'help_viewed');
    return (
      `*🤖 ফ্রেন্ড — তোমার স্মার্ট AI অ্যাসিস্ট্যান্ট*\n\n` +
      `*📝 নোট সেভ করো:*\n` +
      `মনে রাখ: [কথা]\n\n` +
      `*⏰ রিমাইন্ডার দাও:*\n` +
      `মনে করিয়ে দে [কথা] [সময়]\n` +
      `_উদাহরণ: মনে করিয়ে দে ওষুধ ৩ ঘণ্টা পরে_\n\n` +
      `*🎮 গ্যামিফিকেশন (পয়েন্ট ও ব্যাজ):*\n` +
      `• শেষ [নম্বর] — কাজ সম্পন্ন করো ও +15 XP পাও!\n` +
      `• পয়েন্ট — তোমার স্কোর, লেভেল ও স্ট্রিক কার্ড\n` +
      `• ব্যাজ — অর্জিত ও আনলক করা ব্যাজসমূহ\n\n` +
      `*📅 ক্যালেন্ডার ভিউ:*\n` +
      `• সাপ্তাহিক ক্যালেন্ডার — চলতি সপ্তাহের রুটিন\n` +
      `• মাসিক ক্যালেন্ডার — পুরো মাসের ক্যালেন্ডার গ্রিড\n\n` +
      `*⏰ স্মার্ট নোটিফিকেশন টাইমিং:*\n` +
      `• স্মার্ট সময় — তোমার কাজের সেরা পিক টাইম প্রোফাইল\n` +
      `_(সময় ছাড়া রিমাইন্ডার দিলে AI পিক টাইম সাজেস্ট করবে)_\n\n` +
      `*🔄 মাল্টি-ডিভাইস সিঙ্ক:*\n` +
      `• সিঙ্ক — ফোন, ট্যাবলেট ও ওয়েব ড্যাশবোর্ড সিঙ্ক লিঙ্ক\n\n` +
      `*☁️ ক্লাউড ব্যাকআপ ও রিস্টোর:*\n` +
      `• ব্যাকআপ — Google Drive ও OneDrive-এ ক্লাউড সেভ\n` +
      `• রিস্টোর — আগের ব্যাকআপ থেকে সব তথ্য পুনরুদ্ধার\n\n` +
      `*📍 লোকেশন রিমাইন্ডার:*\n` +
      `লোকেশন রিমাইন্ডার: [জায়গা] → [কাজ]\n\n` +
      `*📋 অন্যান্য কমান্ড:*\n` +
      `• কী মনে রাখলি? — সব নোট\n` +
      `• খুঁজে দে [শব্দ] — সার্চ\n` +
      `• ভুলে যা [নম্বর] — ডিলিট\n` +
      `• রিপোর্ট · ইনসাইট · হিসাব\n`
    );
  }

  // ── SAVE NOTE ──
  if (intent === 'SAVE_NOTE') {
    const content = extractAfterKeyword(text, INTENTS.SAVE_NOTE);
    if (!content || content.length < 2) {
      return '❌ কী মনে রাখবো বলো!\n\n_উদাহরণ: মনে রাখ: কাল ডাক্তারের appointment_';
    }
    return await executeUniversalAction(userId, userName, {
      intent: 'create',
      resourceType: 'note',
      parameters: { content }
    });
  }

  // ── REMINDER ──
  if (intent === 'REMINDER') {
    const rest = extractAfterKeyword(text, INTENTS.REMINDER);
    const time = parseTime(rest);

    if (!time) {
      const suggested = smartTiming.getSuggestedTime(userId, rest);
      pendingAiSuggestions.set(userId, {
        eventText: rest,
        targetDate: suggested.targetDate,
      });

      return (
        `⏰ *রিমাইন্ডারের সময় দাওনি!*\n\n` +
        `📌 কাজ: *${rest}*\n\n` +
        `🧠 *স্মার্ট টাইমিং সাজেস্ট:* ${suggested.rationale}\n` +
        `👉 *${suggested.formattedBengali}* মনে করিয়ে দেবো কি?\n\n` +
        `*হ্যাঁ* বললে এই সময়ে সেট হবে, অথবা নির্দিষ্ট সময় লিখে পাঠাও (যেমন: "৩ ঘণ্টা পরে" বা "কাল সকাল ১০টায়")।`
      );
    }

    const content = rest
      .replace(/[০-৯\d]+\s*ঘ[নণ][্ট]া\s*পর[ে]?/u, '')
      .replace(/[০-৯\d]+\s*মিনিট\s*পর[ে]?/u, '')
      .replace(/[০-৯\d]+\s*দিন\s*পর[ে]?/u, '')
      .replace(/কাল[^\s]*/u, '')
      .replace(/পরশু/u, '')
      .replace(/সকাল|বিকাল|রাত/u, '')
      .replace(/[০-৯]+(?::[০-৯]+)?\s*(?:টায়|টা)?/u, '')
      .trim() || rest.trim();

    return await executeUniversalAction(userId, userName, {
      intent: 'create',
      resourceType: 'reminder',
      parameters: { content, remindAt: time }
    });
  }

  // ── LIST NOTES ──
  if (intent === 'LIST_NOTES') {
    return await executeUniversalAction(userId, userName, {
      intent: 'list',
      resourceType: 'note'
    });
  }

  // ── SEARCH ──
  if (intent === 'SEARCH') {
    const keyword = extractAfterKeyword(text, INTENTS.SEARCH);
    return await executeUniversalAction(userId, userName, {
      intent: 'search',
      parameters: { query: keyword }
    });
  }

  // ── DELETE ──
  if (intent === 'DELETE') {
    analytics.trackEvent(userId, 'delete_requested', text);
    return await executeDelete(userId, text);
  }

  // ── UNDO ──
  if (intent === 'UNDO') {
    analytics.trackEvent(userId, 'undo_requested', text);
    return await executeUniversalAction(userId, userName, { intent: 'undo' });
  }

  // ── UPDATE ──
  if (intent === 'UPDATE') {
    analytics.trackEvent(userId, 'update_requested', text);
    let mode = 'append';
    let targetRef = 'it';
    let content = text;

    if (/ছোট|shorten|make\s*it\s*shorter/i.test(text)) {
      mode = 'shorten';
      targetRef = 'it';
    } else if (text.includes(':')) {
      const parts = text.split(':');
      targetRef = parts[0].replace(/^(?:edit|update|add|যোগ\s*করো|এডিট|পরিবর্তন\s*করো)\s*/i, '').trim();
      content = parts.slice(1).join(':').trim();
      if (/add|যোগ|items?/i.test(parts[0])) {
        mode = 'append';
      } else {
        mode = 'replace';
      }
    } else if (/change\s*(?:the\s*)?(?:title|name)\s+to\s+/i.test(text)) {
      mode = 'replace';
      targetRef = 'it';
      content = text.replace(/.*change\s*(?:the\s*)?(?:title|name)\s+to\s+/i, '').trim();
    } else if (/পরিবর্তন\s*করে\s+/i.test(text)) {
      mode = 'replace';
      targetRef = 'it';
      content = text.replace(/.*পরিবর্তন\s*করে\s+/i, '').replace(/(?:দাও|করো)$/i, '').trim();
    } else if (/পরিবর্তন|বদলা|rename|change/i.test(text)) {
      mode = 'replace';
    }

    if (/^(?:three\s*items\s*to\s*it|items\s*to\s*it|to\s*it|it)$/i.test(targetRef)) {
      targetRef = 'it';
    }

    return await executeUniversalAction(userId, userName, {
      intent: 'update',
      resourceType: /রিমাইন্ডার|reminder/i.test(text) ? 'reminder' : 'note',
      targetRef,
      parameters: { mode, content }
    });
  }

  // ── LIST REMINDERS ──
  if (intent === 'REMINDERS_LIST') {
    return await executeUniversalAction(userId, userName, {
      intent: 'list',
      resourceType: 'reminder'
    });
  }

  // ── CANCEL REMINDER ──
  if (intent === 'CANCEL_REMINDER') {
    analytics.trackEvent(userId, 'reminder_canceled', text);
    return await executeDelete(userId, text);
  }

  // ── LOCATION REMINDER SAVE ──
  if (intent === 'LOCATION_SAVE') {
    const rest = extractAfterKeyword(text, INTENTS.LOCATION_SAVE);
    // Parse "জায়গা → কাজ" or "জায়গা: কাজ"
    const parts = rest.split(/→|->|:|।/);
    if (parts.length < 2) {
      return (
        `❌ ফরম্যাট ঠিক করো:\n\n` +
        `লোকেশন রিমাইন্ডার: [জায়গা] → [কাজ]\n\n` +
        `_উদাহরণ: লোকেশন রিমাইন্ডার: সুপারশপ → ডিম কিনতে হবে_`
      );
    }
    const place = parts[0].trim();
    const task = parts.slice(1).join(' ').trim();
    const id = locationDb.saveLocationReminder(userId, place, task);
    return (
      `📍 *লোকেশন রিমাইন্ডার সেট হয়েছে!*\n\n` +
      `📌 কাজ: *${task}*\n` +
      `🏪 জায়গা: *${place}*\n\n` +
      `_"${place}" এ পৌঁছালে বা সেই জায়গার লোকেশন শেয়ার করলে মনে করিয়ে দেবো।_\n` +
      `_নম্বর: #${id}_`
    );
  }

  // ── LOCATION LIST ──
  if (intent === 'LOCATION_LIST') {
    const reminders = locationDb.getLocationReminders(userId);
    if (reminders.length === 0) {
      return `📭 কোনো লোকেশন রিমাইন্ডার নেই।\n\n_"লোকেশন রিমাইন্ডার: জায়গা → কাজ" লিখে যোগ করো।_`;
    }
    const list = reminders.map((r, i) =>
      `*${i + 1}.* 🏪 *${r.place_name}*\n   📌 ${r.reminder_text} · _#${r.id}_`
    ).join('\n\n');
    return `*📍 তোমার লোকেশন রিমাইন্ডার (${reminders.length}টি):*\n\n${list}`;
  }

  // ── CALENDAR SETUP ──
  if (intent === 'CALENDAR_SETUP') {
    if (calendarSync.isConfigured()) {
      return `✅ Google Calendar ইতিমধ্যে যুক্ত আছে!\n\n_রিমাইন্ডার সেট করলেই ক্যালেন্ডারে চলে যাবে।_`;
    }
    const authUrl = calendarSync.getAuthUrl();
    if (!authUrl) {
      return (
        `📅 *Google Calendar সেটআপ করতে:*\n\n` +
        `১. https://console.cloud.google.com যাও\n` +
        `২. নতুন project তৈরি করো\n` +
        `৩. Calendar API enable করো\n` +
        `৪. OAuth2 credentials.json ডাউনলোড করো\n` +
        `৫. credentials.json ফাইলটা বটের ফোল্ডারে রাখো\n` +
        `৬. terminal-এ: \`node setup-calendar.js\` চালাও`
      );
    }
    return `📅 Google Calendar যুক্ত করতে এই লিংকে যাও:\n\n${authUrl}`;
  }

  // ── REPORT ──
  if (intent === 'REPORT') {
    analytics.trackEvent(userId, 'report_viewed');
    return analytics.formatReport(userId);
  }

  // ── INSIGHTS ──
  if (intent === 'INSIGHTS') {
    analytics.trackEvent(userId, 'insights_viewed');
    return analytics.formatInsights(userId);
  }

  // ── STATS ──
  if (intent === 'STATS') {
    const stats = db.getUserStats(userId);
    const locReminders = locationDb.getLocationReminders(userId);
    const calStatus = calendarSync.isConfigured() ? '✅ যুক্ত' : '❌ যুক্ত নেই';
    const analyticsData = analytics.getUserAnalytics(userId);
    return (
      `*📊 তোমার হিসাব:*\n\n` +
      `📝 মোট নোট: *${stats.totalNotes}টি*\n` +
      `⏰ সক্রিয় রিমাইন্ডার: *${stats.activeReminders}টি*\n` +
      `📍 লোকেশন রিমাইন্ডার: *${locReminders.length}টি*\n` +
      `📅 Google Calendar: *${calStatus}*\n\n` +
      `_বিস্তারিত রিপোর্টের জন্য: *রিপোর্ট*_\n` +
      `_AI ইনসাইটের জন্য: *ইনসাইট*_`
    );
  }

  // ── MULTI-TIMEFRAME SUMMARY & COMPARATIVE PERSONAL REVIEW ──
  if (intent === 'SUMMARY_REVIEW') {
    analytics.trackEvent(userId, 'summary_review_viewed');
    return await personalReview.generateFullPersonalReview(userId, userName);
  }

  // ── LEARNED PROFILE (LOCAL MODEL VIEW) ──
  if (intent === 'LEARNED_PROFILE') {
    analytics.trackEvent(userId, 'learned_profile_viewed');
    return localLearner.formatLearnedProfileMessage(userId);
  }

  // ── TASK DONE (GAMIFICATION) ──
  if (intent === 'TASK_DONE') {
    const rest = extractAfterKeyword(text, INTENTS.TASK_DONE);
    return await executeUniversalAction(userId, userName, {
      intent: 'complete',
      targetRef: rest || text,
    });
  }

  // ── GAMIFICATION PROFILE ──
  if (intent === 'GAMIFY_PROFILE') {
    analytics.trackEvent(userId, 'profile_viewed');
    return gamification.formatProfileCard(userId, userName);
  }

  // ── BADGES LIST ──
  if (intent === 'BADGES_LIST') {
    analytics.trackEvent(userId, 'badges_viewed');
    return gamification.formatBadgesShowcase(userId);
  }

  // ── WEEKLY CALENDAR ──
  if (intent === 'CALENDAR_WEEK') {
    analytics.trackEvent(userId, 'calendar_week_viewed');
    return calendarView.getWeeklyCalendar(userId);
  }

  // ── MONTHLY CALENDAR ──
  if (intent === 'CALENDAR_MONTH') {
    analytics.trackEvent(userId, 'calendar_month_viewed');
    return calendarView.getMonthlyCalendar(userId);
  }

  // ── SMART TIMING PROFILE ──
  if (intent === 'SMART_TIMING') {
    analytics.trackEvent(userId, 'smart_timing_viewed');
    return smartTiming.formatSmartTimingProfile(userId);
  }

  // ── MULTI-DEVICE SYNC ──
  if (intent === 'MULTI_DEVICE_SYNC') {
    analytics.trackEvent(userId, 'sync_viewed');
    const ip = getWebDashboard().getLocalIpAddress();
    const calOk = calendarSync.isConfigured() ? '✅ যুক্ত' : '⚠️ সেটআপ বাকি (node setup-calendar.js)';
    return (
      `🔄 *মাল্টি-ডিভাইস সিঙ্ক হাব*\n\n` +
      `📱 *১. WhatsApp মাল্টি-ডিভাইস:* ✅ সক্রিয়\n` +
      `   _ফোন, ট্যাবলেট বা পিসির WhatsApp-এ একই সাথে রিমাইন্ডার পৌঁছে যায়।_\n\n` +
      `📅 *২. Google Calendar ক্লাউড সিঙ্ক:* ${calOk}\n` +
      `   _Android, iPhone, iPad ও Mac/Windows ক্যালেন্ডারে সিঙ্ক হয়।_\n\n` +
      `💻 *৩. লাইভ ওয়েব পোর্টাল ও ড্যাশবোর্ড:* ✅ চালু\n` +
      `   _ট্যাবলেট বা পিসির ব্রাউজারে খুলুন:_\n` +
      `   🔗 *http://${ip}:3000*\n` +
      `   _(একই ডিভাইসে: http://localhost:3000)_\n\n` +
      `_যেকোনো ডিভাইস থেকে এক ক্লিকে কাজ সম্পন্ন (Done), নতুন রিমাইন্ডার যোগ ও ক্যালেন্ডার গ্রিড দেখতে পারবেন!_`
    );
  }

  // ── CLOUD BACKUP ──
  if (intent === 'BACKUP') {
    analytics.trackEvent(userId, 'backup_triggered');
    return await cloudBackup.formatBackupResponse(userId);
  }

  // ── RESTORE ──
  if (intent === 'RESTORE') {
    analytics.trackEvent(userId, 'restore_triggered');
    const latestPath = cloudBackup.getLatestBackupPath();
    if (!latestPath) {
      return '❌ কোনো ক্লাউড ব্যাকআপ ফাইল পাওয়া যায়নি। প্রথমে "ব্যাকআপ" লিখে একটি ব্যাকআপ তৈরি করো।';
    }
    const res = cloudBackup.restoreFromBackupFile(latestPath);
    return (
      `✅ *ক্লাউড ব্যাকআপ সফলভাবে রিস্টোর করা হয়েছে!*\n\n` +
      `📝 নোট রিস্টোর: *${res.notesRestored}টি*\n` +
      `⏰ রিমাইন্ডার রিস্টোর: *${res.remindersRestored}টি*\n\n` +
      `_সব তথ্য নিরাপদে ফিরে এসেছে!_ 👍`
    );
  }

  // ── UNKNOWN → Intelligent Conversational AI Processing ────────
  // ব্যবহারকারীর যেকোনো স্বাভাবিক মেসেজ বুঝে স্বয়ংক্রিয়ভাবে কাজ সম্পন্ন করবে (কখনোই 'বুঝতে পারলাম না' বলবে না)
  try {
    const aiParsed = await understandConversationalIntent(text);
    if (aiParsed) {
      // 0. UNDO
      if (aiParsed.action === 'UNDO') {
        analytics.trackEvent(userId, 'ai_undo_executed', text);
        return await executeUniversalAction(userId, userName, { intent: 'undo' });
      }

      // 1. UPDATE
      if (aiParsed.action === 'UPDATE') {
        analytics.trackEvent(userId, 'ai_update_executed', text);
        return await executeUniversalAction(userId, userName, {
          intent: 'update',
          resourceType: aiParsed.resourceType || 'note',
          targetRef: aiParsed.targetRef || 'it',
          parameters: {
            mode: aiParsed.mode || 'append',
            content: aiParsed.content,
          }
        });
      }

      // 2. DELETE
      if (aiParsed.action === 'DELETE') {
        analytics.trackEvent(userId, 'ai_delete_executed', text);
        return await executeUniversalAction(userId, userName, {
          intent: 'delete',
          resourceType: aiParsed.resourceType || 'note',
          targetRef: aiParsed.targetRef || text,
        });
      }

      // 3. REMINDER
      if (aiParsed.action === 'REMINDER') {
        const itemText = aiParsed.content || text;
        let remindAt = parseTime(text) || (aiParsed.timeHint ? parseTime(aiParsed.timeHint) : null);
        if (!remindAt) {
          remindAt = new Date(Date.now() + 60 * 60 * 1000);
        }
        return await executeUniversalAction(userId, userName, {
          intent: 'create',
          resourceType: 'reminder',
          parameters: { content: itemText, remindAt }
        });
      }

      // 4. NOTE
      if (aiParsed.action === 'NOTE') {
        const noteText = aiParsed.content || text;
        return await executeUniversalAction(userId, userName, {
          intent: 'create',
          resourceType: 'note',
          parameters: { content: noteText }
        });
      }

      // 5. COMPLETE
      if (aiParsed.action === 'COMPLETE') {
        return await executeUniversalAction(userId, userName, {
          intent: 'complete',
          targetRef: aiParsed.content || text
        });
      }

      // 6. SEARCH
      if (aiParsed.action === 'SEARCH') {
        return await executeUniversalAction(userId, userName, {
          intent: 'search',
          parameters: { query: aiParsed.query || text }
        });
      }

      // 7. LIST_NOTES
      if (aiParsed.action === 'LIST_NOTES') {
        return await executeUniversalAction(userId, userName, {
          intent: 'list',
          resourceType: 'note'
        });
      }

      // 8. LIST_REMINDERS
      if (aiParsed.action === 'LIST_REMINDERS') {
        return await executeUniversalAction(userId, userName, {
          intent: 'list',
          resourceType: 'reminder'
        });
      }

      // 9. REVIEW
      if (aiParsed.action === 'REVIEW') {
        return await personalReview.generateFullPersonalReview(userId, userName);
      }

      // 10. MEMORY_QUERY (Section 5, 6, 7, 11)
      if (aiParsed.action === 'MEMORY_QUERY') {
        return await executeUniversalAction(userId, userName, {
          intent: 'memory_query',
          parameters: {
            memoryType: aiParsed.memoryType,
            query: aiParsed.query || text,
          }
        });
      }

      // 11. MEMORY_FORGET (Section 5, 11)
      if (aiParsed.action === 'MEMORY_FORGET') {
        return await executeUniversalAction(userId, userName, {
          intent: 'memory_forget',
          targetRef: aiParsed.targetRef || text,
        });
      }

      // 12. REMEMBER_THIS (Section 5)
      if (aiParsed.action === 'REMEMBER_THIS') {
        return await executeUniversalAction(userId, userName, {
          intent: 'remember_this',
          parameters: {
            content: aiParsed.content || text,
          }
        });
      }

      // 13. CHAT
      if (aiParsed.action === 'CHAT' && aiParsed.reply) {
        return aiParsed.reply;
      }
    }
  } catch (err) {
    console.error('Conversational AI error:', err.message);
  }

  // ── লোকাল ফলব্যাক (AI ছাড়া বা অফলাইন হলেও কখনোই উল্টাপাল্টা নোট সেভ করবে না) ──
  // ০. Undo
  if (/(?:undo|revert|আগেরটা\s*ফিরিয়ে|পূর্বের\s*অবস্থায়|ভুল\s*হয়েছে|undo\s*koro)/i.test(text)) {
    return await executeUniversalAction(userId, userName, { intent: 'undo' });
  }

  // ০.১ মেমরি কুয়েরি (আগের মিটিংয়ে কী সিদ্ধান্ত হয়েছিল, ওই ছবিতে কী ছিল, আমার সম্পর্কে কী মনে রেখেছো)
  if (/(?:আগের\s*মিটিং|মিটিংয়ে\s*কী|মিটিংয়ের\s*সিদ্ধান্ত|ছবিতে\s*কী|ছবির\s*লেখা|আমার\s*সম্পর্কে\s*কী\s*মনে|what\s*do\s*you\s*remember)/i.test(text)) {
    return await executeUniversalAction(userId, userName, {
      intent: 'memory_query',
      parameters: {
        query: text,
        memoryType: /মিটিং|meeting/i.test(text) ? 'meeting' : (/ছবি|image/i.test(text) ? 'image' : 'all'),
      }
    });
  }

  // ০.২ এই তথ্যটা আর মনে রেখো না / forget this
  if (/(?:এই\s*তথ্যটা\s*আর\s*মনে\s*রেখো\s*না|মনে\s*রেখো\s*না|forget\s*this|আমার\s*ডাটা\s*মুছো|মেমরি\s*মুছে)/i.test(text)) {
    return await executeUniversalAction(userId, userName, {
      intent: 'memory_forget',
      targetRef: text.replace(/এই\s*তথ্যটা\s*আর\s*মনে\s*রেখো\s*না|মনে\s*রেখো\s*না|forget\s*this/gi, '').trim() || 'all',
    });
  }

  // ০.৩ এটা মনে রাখো / remember this
  if (/(?:এটা\s*মনে\s*রাখ[ো]?|remember\s*this|মনে\s*রাখো\s*এটা|মনে\s*রাখো)/i.test(text.trim())) {
    const cleaned = text.replace(/^(?:এটা\s*মনে\s*রাখ[ো]?|remember\s*this|মনে\s*রাখো\s*এটা|মনে\s*রাখো)[:\s]*/i, '').trim() || text;
    return await executeUniversalAction(userId, userName, {
      intent: 'remember_this',
      targetRef: cleaned,
      parameters: { content: cleaned },
    });
  }

  // ১. যদি মুছে ফেলা বা ডিলিটের কথা থাকে
  if (/(?:ডিলিট|delete|মুছে|মুছ|ভুলে\s*যা|বাতিল|রিমুভ|হটা|কেটে\s*দে|muche|muchhe|bhule|bad\s*dao|katia)/i.test(text)) {
    return await executeDelete(userId, text);
  }

  // ১.৫ যদি আপডেট / এডিট / পরিবর্তন / ছোট করার কথা থাকে
  if (/(?:এডিট|update|ছোট\s*কর[ো]?|shorten|add\s*to\s*it|যোগ\s*কর[ো]?|নাম\s*পরিবর্তন|make\s*it\s*shorter)/i.test(text)) {
    return await executeUniversalAction(userId, userName, {
      intent: 'update',
      targetRef: 'it',
      parameters: { mode: /ছোট|short/i.test(text) ? 'shorten' : 'append', content: text }
    });
  }

  // ২. সাধারণ গ্রিটিংস বা সম্ভাষণ
  if (/^(?:হ্যালো|হেলো|হাই|নমস্কার|আস্সালামু|hello|hi|hey)\b/i.test(text)) {
    const stats = db.getUserStats(userId);
    const name = userName ? ` ${userName.split(' ')[0]}` : '';
    return (
      `*হেই${name}! আমি ফ্রেন্ড* 👋\n\n` +
      `তোমার কাছে এখন আছে:\n` +
      `📝 *${stats.totalNotes}টি নোট*\n` +
      `⏰ *${stats.activeReminders}টি রিমাইন্ডার*\n\n` +
      `কী মনে রাখতে চাও বা সাহায্য চাও? বলো! 😊`
    );
  }

  // ৩. কুশল বিনিময় বা অবস্থা জানতে চাওয়া
  if (/(?:কেমন\s*আছ[েনো]?|কী\s*খবর|কি\s*খবর|how\s*are\s*you|kemon\s*aso|kemon\s*acho|ki\s*khobor)/i.test(text)) {
    return `আমি খুব ভালো আছি! তোমার দিন কেমন কাটছে? আজ তোমাকে কীসে সাহায্য করতে পারি বলো। 😊`;
  }

  // ৪. বটের পরিচয় ও কাজ
  if (/(?:তুমি\s*কে|কে\s*তুমি|বট|who\s*are\s*you|কি\s*করতে\s*পার|কী\s*করতে\s*পার|tumi\s*k|tumi\s*ke|ki\s*korte\s*paro)/i.test(text)) {
    return (
      `আমি ফ্রেন্ড — তোমার সার্বক্ষণিক বাংলা ও বাংলিশ স্মার্ট AI অ্যাসিস্ট্যান্ট! 🤖\n\n` +
      `যেকোনো কথা মনে রাখা, সঠিক সময়ে রিমাইন্ডার দেওয়া, গুগল ক্যালেন্ডার সিঙ্ক এবং পার্সোনাল প্রগ্রেস ট্র্যাক করতে আমি কাজ করি।\n\n` +
      `_সব কমান্ড দেখতে লেখো: *সাহায্য*_`
    );
  }

  // ৫. ধন্যবাদ ও কৃতজ্ঞতা
  if (/(?:ধন্যবাদ|থ্যাংকস|thanks|thank\s*you|dhonnobad|dhonobad)/i.test(text)) {
    return `তোমাকে অনেক ধন্যবাদ! যেকোনো দরকারে আমাকে পাশে পাবে। ❤️`;
  }

  // ৬. স্বীকৃতি / ছোট উত্তর
  if (/^(?:হুম|আচ্ছা|ঠিক\s*আছে|ok|okay|yes|হুঁ|hm|hmm)$/i.test(text)) {
    return `ঠিক আছে বন্ধু! আর কিছু মনে রাখতে বা সাহায্য লাগলে বলো। 👍`;
  }

  // ৭. সময় থাকলে রিমাইন্ডার সেট করো
  const localTime = parseTime(text);
  if (localTime) {
    const reminderId = db.saveReminder(userId, text, localTime);
    return (
      `⏰ *রিমাইন্ডার সেট করা হলো!*\n\n` +
      `📌 *${text}*\n` +
      `🕒 *সময়:* ${formatTime(localTime)}\n\n` +
      `✅ _সময় হওয়ামাত্রই মনে করিয়ে দিয়ে তালিকা থেকে মুছে দেবো।_`
    );
  }

  // ৮. যদি স্পষ্টভাবে কোনো তথ্য সংরক্ষণের লক্ষণ থাকে (মনে রাখ, সেভ, পাসওয়ার্ড, চাবি, ইত্যাদি)
  const looksLikeNote = /(?:মনে\s*রাখ|সেভ|লিখে\s*রাখ|note|save|mone\s*rakh|likhe\s*rakh|save\s*koro|চাবি|পাসওয়ার্ড|password|ঠিকানা|কোড|লগইন|কিনতে\s*হবে|kinte\s*hobe|টাকা|hishab|হিসাব)/i.test(text);
  if (looksLikeNote) {
    const noteId = db.saveNote(userId, text);
    return (
      `📝 *মনে রেখেছি!*\n\n` +
      `📌 ${text}\n\n` +
      `_এটি তোমার নোটে সেভ করা হলো (#${noteId})।_\n` +
      `_মুছতে চাইলে বলবে: ডিলিট_`
    );
  }

  // ৯. অন্য যেকোনো সাধারণ কথার ক্ষেত্রে উল্টাপাল্টা নোট সেভ না করে মার্জিত নির্দেশনা
  return (
    `আমি তোমার মেসেজটি পেয়েছি! 😊\n\n` +
    `তুমি কি এটি *নোট* হিসেবে রাখতে চাও নাকি কোনো *রিমাইন্ডার* দিতে চাও?\n\n` +
    `• নোট সেভ করতে: *মনে রাখ: ${text}*\n` +
    `• রিমাইন্ডার দিতে: *মনে করিয়ে দে ${text} [সময়]*\n` +
    `• ডিলিট করতে: *ডিলিট*\n` +
    `• সাহায্য দেখতে: *সাহায্য*`
  );
}

module.exports = { handleMessage, pendingAiSuggestions };
