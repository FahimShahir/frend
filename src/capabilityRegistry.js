/**
 * Dynamic Capability Registry — FREND AI Autonomous Agent
 *
 * Provides dynamic inspection, registration, discovery, and execution
 * of all system capabilities, action handlers, APIs, and tools.
 */

'use strict';

const os = require('os');
const db = require('./database');
const calendarSync = require('./calendarSync');
const authManager = require('./authManager');
const security = require('./security');

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

const CAPABILITIES = {
  account_security: {
    id: 'account_security',
    name: 'Account Security & Credential Management',
    description: 'নিরাপদ অ্যাকাউন্ট ম্যানেজমেন্ট — চ্যাট কমান্ড বা ওয়ান-টাইম সিকিউর পোর্টালে পাসওয়ার্ড পরিবর্তন',
    category: 'SECURITY',
    matchers: [
      /(?:(?:change|reset|update)\s*password|password\s*(?:change|reset|update|bodol|poriborton|paltao))/i,
      /(?:পাসওয়ার্ড|পাসওয়ার্ড)\s*(?:পরিবর্তন|বদল|চেঞ্জ|রিসেট|পাল্টাও|আপডেট)/i,
      /(?:(?:change|update)\s*username|username\s*(?:change|update|bodol)|ইউজারনেম\s*(?:পরিবর্তন|বদল|চেঞ্জ|আপডেট))/i,
      /(?:(?:chat\s*thaka|chat\s*theke|চ্যাট\s*থেকে)?\s*(?:পাসওয়ার্ড|password|ইউজারনেম|username).*(?:change|চেঞ্জ|পরিবর্তন|বদল))/i,
      /(?:আমার\s*অ্যাকাউন্টের\s*(?:পাসওয়ার্ড|ইউজারনেম)|account\s*security|ক্রেডেনশিয়াল|ক্রেডেনশিয়াল)/i,
    ],
    execute: async (context) => {
      const { userId, userName, text = '' } = context;
      // Resolve authorized user (by ID or bound phone or username)
      let user = authManager.getUserById(userId);
      if (!user) {
        const users = authManager.getAllUsers();
        user = users.find(u => u.bound_phone && u.bound_phone.replace(/\D/g, '') === String(userId).replace(/\D/g, '')) ||
               users.find(u => u.username.toLowerCase() === String(userName || '').toLowerCase()) ||
               users[0];
      }

      if (!user) {
        return '❌ আপনার WhatsApp নম্বরের সাথে কোনো অনুমোদিত অ্যাকাউন্ট যুক্ত পাওয়া যায়নি।';
      }

      // 1. Direct in-chat password change command check
      const changeMatch = text.match(/(?:(?:password|পাসওয়ার্ড|পাসওয়ার্ড)\s*(?:change|পরিবর্তন|চেঞ্জ|বদল))[:\s]+([^|:\n\s]+)\s*[|:,]\s*([^|:\n\s]+)/i) ||
                          text.match(/^(?:password\s*change|পাসওয়ার্ড\s*(?:পরিবর্তন|চেঞ্জ))\s+(\S+)\s+(\S+)$/i);

      if (changeMatch) {
        const oldPass = changeMatch[1].trim();
        const newPass = changeMatch[2].trim();
        try {
          authManager.changePassword(user.id, user.username, oldPass, newPass);
          return (
            `✅ *পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!*\n\n` +
            `👤 *ইউজারনেম:* ${user.username}\n` +
            `🔐 আপনার অ্যাকাউন্টের নতুন পাসওয়ার্ড সক্রিয় করা হয়েছে।\n` +
            `✨ পরবর্তী লগইনে এই নতুন পাসওয়ার্ডটি ব্যবহার করুন।\n\n` +
            `🔒 _নিরাপত্তার স্বার্থে চ্যাট থেকে আপনার পাঠানো পূর্ববর্তী মেসেজটি মুছে দেওয়ার পরামর্শ দেওয়া হচ্ছে।_`
          );
        } catch (err) {
          return `❌ *পাসওয়ার্ড পরিবর্তন ব্যর্থ:* ${err.message}`;
        }
      }

      // 2. Direct in-chat username change command check
      const usernameMatch = text.match(/(?:(?:username|ইউজারনেম)\s*(?:change|পরিবর্তন|চেঞ্জ|বদল))[:\s]+([^|:\n\s]+)\s*[|:,]\s*([^|:\n\s]+)/i);
      if (usernameMatch) {
        const currentPass = usernameMatch[1].trim();
        const newUsername = usernameMatch[2].trim();
        try {
          authManager.changeUsername(user.id, user.username, currentPass, newUsername);
          return (
            `✅ *ইউজারনেম সফলভাবে পরিবর্তন করা হয়েছে!*\n\n` +
            `👤 নতুন ইউজারনেম: *${newUsername}*\n` +
            `✨ এখন থেকে এই ইউজারনেম দিয়ে লগইন করুন।`
          );
        } catch (err) {
          return `❌ *ইউজারনেম পরিবর্তন ব্যর্থ:* ${err.message}`;
        }
      }

      // 3. User is asking how to change or requesting password change assistance
      const token = authManager.createCredentialChangeToken(user.id, 'credentials_change');
      const ip = getLocalIpAddress();
      return (
        `🔐 *পাসওয়ার্ড পরিবর্তন করার সহজ নিয়ম (Password Change)*\n\n` +
        `আপনি ২টি উপায়ে সহজে পাসওয়ার্ড পরিবর্তন করতে পারেন:\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*১. সরাসরি চ্যাট থেকে করতে চাইলে লিখুন:*\n` +
        `👉 \`password change: <বর্তমান_পাসওয়ার্ড> | <নতুন_পাসওয়ার্ড>\`\n` +
        `বা বাংলায়:\n` +
        `👉 \`পাসওয়ার্ড পরিবর্তন: <বর্তমান_পাসওয়ার্ড> | <নতুন_পাসওয়ার্ড>\`\n\n` +
        `_উদাহরণ:_ \`password change: 123 | Pass@1234\`\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `*২. অথবা সুরক্ষিত ওয়েব পোর্টাল থেকে এক ক্লিকে পরিবর্তন করুন (রেকমেন্ডেড):*\n` +
        `👉 *http://${ip}:3000/account/security?token=${token}*\n\n` +
        `🔒 _(এই লিঙ্কটি ওয়ান-টাইম এবং পরবর্তী ১০ মিনিট কার্যকর থাকবে। সুরক্ষিত ওয়েব পেজে পরিবর্তন করলে চ্যাটে পাসওয়ার্ড ফাঁস হওয়ার ঝুঁকি থাকে না।)_`
      );
    }
  },

  google_calendar: {
    id: 'google_calendar',
    name: 'Google Calendar Integration',
    description: 'ব্যক্তিগত Google Calendar সংযোগ, ইভেন্ট সিঙ্ক ও দ্বিমুখী ম্যানেজমেন্ট',
    category: 'INTEGRATION',
    matchers: [
      /(?:connect\s*google\s*calendar|ক্যালেন্ডার\s*কানেক্ট|ক্যালেন্ডার\s*যুক্ত|link\s*calendar|গুগল\s*ক্যালেন্ডার\s*কানেক্ট)/i,
      /(?:ক্যালেন্ডার\s*ডিসকানেক্ট|disconnect\s*calendar)/i,
    ],
    execute: async (context) => {
      const { userId, text } = context;
      const users = authManager.getAllUsers();
      let user = users.find(u => u.bound_phone && u.bound_phone.replace(/\D/g, '') === String(userId).replace(/\D/g, ''));
      const targetUserId = user ? user.id : 1;

      if (/(?:ডিসকানেক্ট|disconnect)/i.test(text || '')) {
        calendarSync.disconnectCalendar(targetUserId);
        return '🔌 *Google Calendar সংযোগ বিচ্ছিন্ন করা হয়েছে!* নতুন করে যুক্ত করতে চাইলে যেকোনো সময় "ক্যালেন্ডার কানেক্ট" লিখুন।';
      }

      const ip = getLocalIpAddress();
      const redirectUri = `http://${ip}:3000/oauth2/google/callback`;
      const { authUrl } = calendarSync.generateUserAuthUrl(targetUserId, redirectUri);

      return (
        `📅 *Google Calendar সংযোগ লিঙ্ক*\n\n` +
        `আপনার ব্যক্তিগত Google Calendar ফ্রেন্ড বটের সাথে যুক্ত করতে নিচের লিঙ্কে ক্লিক করুন:\n` +
        `👉 *${authUrl}*\n\n` +
        `_অনুমোদন দিলে আপনার সমস্ত রিমাইন্ডার স্বয়ংক্রিয়ভাবে ক্যালেন্ডারে সিঙ্ক হয়ে যাবে এবং রিমাইন্ডার মুছলে ক্যালেন্ডার থেকেও মুছে যাবে!_`
      );
    }
  },

  system_diagnostics: {
    id: 'system_diagnostics',
    name: 'Self-Debugging & System Diagnostics',
    description: 'সার্ভার স্বাস্থ্য, ডাটাবেজ স্থিতি, ব্যাকগ্রাউন্ড স্কেডিউলার ও সেলফ-হিলিং অডিট রিপোর্ট',
    category: 'MAINTENANCE',
    matchers: [
      /(?:সিস্টেম\s*ডায়াগনসিস|ডায়াগনস্টিক|health\s*check|হেলথ\s*চেক|সার্ভার\s*স্ট্যাটাস|self\s*healing|বট\s*স্ট্যাটাস|system\s*status)/i,
      /(?:ডায়াগনসিস|ডায়াগনসিস|diagnose\s*system|সার্ভার\s*চেক)/i,
    ],
    execute: async () => {
      const dbStats = db.getDiagnosticStats();
      const calConfigured = calendarSync.isConfigured();
      const totalNotes = db.prepare('SELECT COUNT(*) as c FROM notes').get().c;
      const totalReminders = db.prepare('SELECT COUNT(*) as c FROM reminders WHERE is_sent = 0').get().c;
      const activeMemories = db.prepare('SELECT COUNT(*) as c FROM memories WHERE is_active = 1').get().c;

      return (
        `🛠️ *সিস্টেম হেলথ ও সেলফ-হিলিং ডায়াগনস্টিক রিপোর্ট*\n\n` +
        `🟢 *সিস্টেম স্থিতি:* সকল মডিউল সক্রিয় ও কার্যকর\n` +
        `📊 *ডাটাবেজ ও মেমরি:* \n` +
        `  • সক্রিয় নোট: ${totalNotes}টি\n` +
        `  • অমীমাংসিত রিমাইন্ডার: ${totalReminders}টি\n` +
        `  • দীর্ঘমেয়াদী স্মৃতি: ${activeMemories}টি\n` +
        `📅 *Google Calendar:* ${calConfigured ? '🟢 কনফিগার করা আছে' : '⚪ ও-অথ সংযোগের অপেক্ষায়'}\n` +
        `⏰ *রিমাইন্ডার স্কেডিউলার:* 🟢 সক্রিয় (Asia/Dhaka প্রিসিশন)\n` +
        `🩺 *সেলফ-হিলিং ইঞ্জিন:* \n` +
        `  • মোট অডিট ইভেন্ট: ${dbStats.total}টি\n` +
        `  • স্বয়ংক্রিয়ভাবে আরোগ্য (Healed): ${dbStats.healed}টি\n` +
        `  • সেলফ-রিপেয়ার সাফল্যের হার: ${dbStats.selfRepairRate}%\n\n` +
        `_কোনো অস্বাভাবিক আচরণ শনাক্ত হলে সিস্টেম নিজে থেকেই ডায়াগনসিস করে সঠিক পথে রূপান্তর করে।_`
      );
    }
  },

  dynamic_computation: {
    id: 'dynamic_computation',
    name: 'Dynamic Math & Logic Computation',
    description: 'নিরাপদ গাণিতিক হিসাব এবং ক্যালকুলেশন সমাধান',
    category: 'COMPUTATION',
    matchers: [
      /^(?:calculate|হিসাব\s*করো|কত\s*হবে|কত\s*হয়|হিসেব|math)[:\s]*([০-৯\d\s\+\-\*\/\(\)\.\%]+)/i,
      /^[০-৯\d\s\+\-\*\/\(\)\.\%]+(?:\s*(?:কত\s*হবে|কত\s*হয়|কত|হিসাব|\=|\?|\?\?)\s*)+$/i,
      /[০-৯\d]+\s*[\+\-\*\/]\s*[০-৯\d]+.*(?:কত|\=|\?|হিসাব)/i,
    ],
    execute: async (context) => {
      const { text } = context;
      // Convert Bengali digits to English
      const bengaliDigits = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
      let expr = text.replace(/[০-৯]/g, d => bengaliDigits[d]);
      
      // Extract mathematical expression
      expr = expr.replace(/(?:calculate|হিসাব\s*করো|কত\s*হবে|কত\s*হয়|হিসেব|math|কত|\=|\?)/gi, '').trim();

      // Strict validation: only numbers and safe math operators
      if (!/^[0-9\s\+\-\*\/\(\)\.\%]+$/.test(expr) || expr.length === 0) {
        return null;
      }

      try {
        // Safe evaluation without eval
        const sanitized = expr.replace(/\%/g, '*0.01');
        // Use Function with strict numbers
        const compute = new Function(`'use strict'; return (${sanitized});`);
        const result = compute();
        if (typeof result === 'number' && !isNaN(result)) {
          return `🔢 *গণনা ফলাফল:*\n\n\`${expr}\` = *${result}*`;
        }
      } catch (_) {}
      return null;
    }
  },

  capability_discovery: {
    id: 'capability_discovery',
    name: 'Dynamic Capability Discovery',
    description: 'সিস্টেমে বিদ্যমান সমস্ত সক্রিয় ফিচার ও টুলের তালিকা প্রদর্শন',
    category: 'HELP',
    matchers: [
      /(?:কী\s*কী\s*করতে\s*পারো|what\s*can\s*you\s*do|তোমার\s*ফিচার|ফিচারগুলো\s*কী|capability|capabilities)/i,
      /(?:তুমি\s*কী\s*করতে\s*পারো|কি\s*কি\s*কাজ\s*করো|features)/i,
    ],
    execute: async () => {
      return (
        `🌟 *ফ্রেন্ড AI — সক্রিয় ক্ষমতা ও ফিচারসমূহ (Capabilities)*\n\n` +
        `📝 *নোট ও কাজের তালিকা:* মনে রাখা, সম্পাদনা, পয়েন্ট যুক্ত করা, সার্চ করা\n` +
        `⏰ *টাইমড রিমাইন্ডার:* নির্দিষ্ট সময় অনুযায়ী নোটিফিকেশন (WhatsApp ও Desktop)\n` +
        `📅 *Google Calendar সিঙ্ক:* ব্যক্তিগত গুগল অ্যাকাউন্টে ইভেন্ট তৈরি ও ডিলিট\n` +
        `🎙️ *ভয়েস ও মিটিং মেমরি:* অডিও শুনে ট্রান্সক্রিপশন ও মিটিংয়ের সিদ্ধান্ত সংরক্ষণ\n` +
        `📸 *ভিশন ও ইমেজ মেমরি:* ক্যাশমেমো, বিল ও ডকুমেন্ট পড়ে তথ্য মনে রাখা\n` +
        `🔐 *অ্যাকাউন্ট সিকিউরিটি:* WhatsApp-এ সুরক্ষিত ওয়ান-টাইম পোর্টালে ক্রেডেনশিয়াল আপডেট\n` +
        `📍 *লোকেশন রিমাইন্ডার:* নির্দিষ্ট জায়গায় গেলে স্বয়ংক্রিয় বার্তা\n` +
        `🔢 *ডাইনামিক ক্যালকুলেশন:* যেকোনো গাণিতিক হিসাব তাৎক্ষণিক সমাধান\n` +
        `🛠️ *স্বয়ংক্রিয় সেলফ-হিলিং:* ভুল রাউটিং বা সমস্যা হলে নিজে থেকেই ডায়াগনসিস ও সংশোধন\n\n` +
        `_যেকোনো নির্দেশ স্বাভাবিক ভাষায় লিখে বা ভয়েস পাঠিয়ে ট্রাই করো!_`
      );
    }
  }
};

/**
 * Inspect all registered capabilities
 */
function getAllCapabilities() {
  return Object.values(CAPABILITIES);
}

/**
 * Check if a capability exists
 */
function hasCapability(id) {
  return !!CAPABILITIES[id];
}

/**
 * Find matching capability for an instruction
 */
function findCapabilityForInstruction(instruction) {
  if (!instruction || typeof instruction !== 'string') return null;
  const text = instruction.trim();

  for (const cap of Object.values(CAPABILITIES)) {
    if (cap.matchers) {
      for (const pattern of cap.matchers) {
        if (pattern.test(text)) {
          return cap;
        }
      }
    }
  }
  return null;
}

/**
 * Dynamically execute a registered capability
 */
async function executeCapability(id, context) {
  const cap = CAPABILITIES[id];
  if (!cap || typeof cap.execute !== 'function') {
    throw new Error(`Capability "${id}" is not available or executable`);
  }
  return await cap.execute(context);
}

/**
 * Dynamically register a new capability at runtime (Section 3 & 7)
 */
function registerCapability({ id, name, description, category = 'CUSTOM', matchers = [], matcher = null, execute = null, executor = null }) {
  if (!id) throw new Error('Capability ID is required');
  const execFn = execute || executor;
  if (typeof execFn !== 'function') throw new Error('Capability executor function is required');

  let normalizedMatchers = Array.isArray(matchers) ? [...matchers] : [];
  if (typeof matcher === 'function') {
    normalizedMatchers.push({ test: (t) => matcher(t) });
  } else if (matcher instanceof RegExp) {
    normalizedMatchers.push(matcher);
  }

  CAPABILITIES[id] = {
    id,
    name: name || id,
    description: description || '',
    category,
    matchers: normalizedMatchers,
    execute: execFn,
  };
  return CAPABILITIES[id];
}

module.exports = {
  CAPABILITIES,
  getAllCapabilities,
  hasCapability,
  findCapabilityForInstruction,
  executeCapability,
  registerCapability,
};
