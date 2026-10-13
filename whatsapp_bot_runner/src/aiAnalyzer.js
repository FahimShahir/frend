/**
 * AI Analyzer — Gemini API দিয়ে স্মার্ট রিমাইন্ডার সাজেস্ট করে।
 * কনভার্সেশনাল মেসেজ থেকে সময়/ইভেন্ট বোঝে।
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiConfig = require('./aiConfig');

// Media persistence directory
const mediaDir = path.join(__dirname, '..', 'data', 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

function saveMediaAttachment(buffer, ext = 'bin', prefix = 'media') {
  const cleanExt = String(ext || 'bin').replace(/^\./, '');
  const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${cleanExt}`;
  const filePath = path.join(mediaDir, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    filename,
    filePath,
    relativePath: path.join('data', 'media', filename),
  };
}

let genAI = null;
let currentKey = null;

function getClient() {
  const settings = aiConfig.getSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAI || currentKey !== apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    currentKey = apiKey;
  }
  return genAI;
}

const SYSTEM_PROMPT = `তুমি একটি বাংলা/ইংরেজি মেসেজ বিশ্লেষক। তোমার কাজ হলো মেসেজে কোনো সময়-নির্ভর ইভেন্ট বা অ্যাপয়েন্টমেন্ট আছে কিনা বোঝা।

যদি মেসেজে কোনো ভবিষ্যৎ ইভেন্ট থাকে (যেমন: "কাল দেখা হবে", "পরশু মিটিং", "ওষুধ খাওয়ার কথা ছিল", "ফ্লাইট আগামীকাল"), তাহলে JSON ফরম্যাটে রিপ্লাই দাও:

{
  "hasEvent": true,
  "suggestion": "রিমাইন্ডার সাজেস্ট বাক্য (বাংলায়)",
  "eventText": "ইভেন্টের বিষয় (সংক্ষেপে)",
  "timeHint": "সময়ের ইঙ্গিত (যেমন: কাল, আগামীকাল, ২ দিন পরে)"
}

যদি কোনো ইভেন্ট না থাকে:
{
  "hasEvent": false
}

শুধু JSON দাও, অন্য কিছু না।`;

function getModelList() {
  const settings = aiConfig.getSettings();
  const list = [
    settings.geminiModel,
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
  ].filter(Boolean);
  return [...new Set(list)];
}

async function generateWithFallback(client, parts, timeoutMs = 15000) {
  let lastErr = null;
  const models = getModelList();
  for (const modelName of models) {
    let timerId = null;
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const apiCall = model.generateContent(parts);
      const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error(`AI Request Timeout (${modelName})`)), timeoutMs);
      });
      const res = await Promise.race([apiCall, timeoutPromise]);
      if (timerId) clearTimeout(timerId);
      return res;
    } catch (err) {
      if (timerId) clearTimeout(timerId);
      lastErr = err;
      continue;
    }
  }
  throw lastErr;
}

/**
 * মেসেজ বিশ্লেষণ করে ইভেন্ট সাজেস্ট করে
 * @param {string} message
 * @returns {Promise<{hasEvent: boolean, suggestion?: string, eventText?: string, timeHint?: string}>}
 */
async function analyzeForSmartReminder(message) {
  const client = getClient();
  if (!client) return { hasEvent: false };

  // Skip if it's a command (starts with known keywords)
  const commandPrefixes = [
    'মনে রাখ', 'সেভ কর', 'note:', 'save:', 'মনে করিয়ে',
    'reminder', 'খুঁজে', 'search', 'ভুলে', 'delete', 'সাহায্য', 'help',
    'কী মনে', 'স্ট্যাটস', 'stats', 'হ্যালো', 'হাই', 'hi', 'hello',
  ];
  if (commandPrefixes.some(p => message.toLowerCase().startsWith(p.toLowerCase()))) {
    return { hasEvent: false };
  }

  // Skip very short messages
  if (message.length < 8) return { hasEvent: false };

  try {
    const result = await generateWithFallback(client, [
      { text: SYSTEM_PROMPT },
      { text: `মেসেজ: "${message}"` },
    ]);
    const text = result.response.text().trim();

    // Extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { hasEvent: false };

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    // Silent fail — AI is optional
    console.error('[AI] বিশ্লেষণ সমস্যা:', err.message);
    return { hasEvent: false };
  }
}

/**
 * ভয়েস মেসেজ ট্রান্সক্রাইব করে (Gemini multimodal)
 * @param {Buffer} audioBuffer - audio file buffer
 * @param {string} mimeType
 * @returns {Promise<string|null>}
 */
async function transcribeVoice(audioBuffer, mimeType = 'audio/ogg') {
  const client = getClient();
  if (!client) return null;

  try {
    const result = await generateWithFallback(client, [
      {
        inlineData: {
          mimeType,
          data: audioBuffer.toString('base64'),
        },
      },
      {
        text: 'এই ভয়েস মেসেজটি বাংলা বা ইংরেজিতে ট্রান্সক্রাইব করো। শুধু ট্রান্সক্রিপশন দাও, অন্য কিছু নয়।',
      },
    ]);
    return result.response.text().trim();
  } catch (err) {
    console.error('[AI] ভয়েস ট্রান্সক্রিপশন সমস্যা:', err.message);
    return null;
  }
}

/**
 * সম্পূর্ণ কনভার্সেশনাল মেসেজ বিশ্লেষণ করে অ্যাকশন নির্ধারণ করে
 * @param {string} message
 * @returns {Promise<{action: string, content?: string, timeHint?: string, query?: string, reply?: string}|null>}
 */
const CONVERSATIONAL_SYSTEM_PROMPT = `তুমি FREND — ব্যবহারকারীর বাংলা ও বাংলিশ (Banglish) ব্যক্তিগত AI অ্যাসিস্ট্যান্ট ও মেমরি বট।
ব্যবহারকারী তার নিজের ভাষায় যেকোনোভাবে মেসেজ লিখতে পারে — যেমন: বাংলা লিপি ("নোট ডিলিট কর"), বাংলিশ ("amr note add koro", "ager ta delete koro", "kal sokal 10 tay mone koraio", "kaj sesh", "sob note dekhaw"), ইংরেজি ("delete last note", "remind me"), বা মিশ্র ভাষা।

তোমার কাজ হলো ব্যবহারকারী যেভাবে বা যে ভাষাতেই লিখুক না কেন, তার আসল ইচ্ছা (Intent) বুঝে সঠিক ক্যাটাগরি ও অ্যাকশন শনাক্ত করা:

ক্যাটাগরি ও অ্যাকশনসমূহ:
1. NOTE (কোনো তথ্য মনে রাখতে, সেভ করতে বা নতুন নোট তৈরি করতে বললে):
   - উদাহরণ: "note add: kal meeting", "chabi drawer e rakhsi", "mone rakh password 1234", "bazar er list likhe rakho", "add note grocery", "একটা নোট তৈরি করো"
   action: "NOTE"
   content: "সংরক্ষণযোগ্য মূল তথ্য"

2. UPDATE (আগের কোনো নোট বা রিমাইন্ডার এডিট করতে, যোগ করতে, ছোট করতে বা পরিবর্তন করতে বললে):
   - উদাহরণ: "Add three items to it", "এটার নাম পরিবর্তন করো", "আগের লেখাটা একটু ছোট করো", "২য় নোটটা এডিট করো", "make it shorter", "update note"
   action: "UPDATE"
   resourceType: "note" | "reminder"
   targetRef: "last" | "1st" | "2nd" | "3rd" | "it" | "আইডি নম্বর বা নাম"
   content: "নতুন তথ্য বা যা যোগ করতে হবে"
   mode: "append" | "shorten" | "replace"

3. REMINDER (ভবিষ্যতে নির্দিষ্ট কোনো সময়ে কাজ মনে করিয়ে দিতে বা রিমাইন্ডার সেট করতে বললে):
   - উদাহরণ: "kal sokal 10 tay meeting mone koraio", "3 ghonta por medicine reminder", "raat 9 tay call dio", "কাল বিকেলে মনে করিয়ে দে", "call mom at 5pm"
   action: "REMINDER"
   content: "মূল কাজের বিষয়"
   timeHint: "সময়ের ইঙ্গিত (যেমন: kal sokal 10 tay, 3 ghonta por, কাল রাত ৯টা)"

4. DELETE (কোনো নোট বা রিমাইন্ডার মুছে ফেলতে, বাদ দিতে, ডিলিট বা বাতিল করতে বললে):
   - উদাহরণ: "ager note ta delete koro", "last ta muche dao", "delete note 1", "sob delete", "reminder cancel koro", "এবার দ্বিতীয়টা ডিলিট করো", "ভুলে যাও", "মুছে ফেল"
   action: "DELETE"
   resourceType: "note" | "reminder" | "all"
   targetRef: "last" | "1st" | "2nd" | "3rd" | "all" | "আইডি নম্বর বা বিষয়বস্তু"

5. UNDO (আগের কোনো কাজ ভুলবশত করা হলে তা পূর্বাবস্থায় ফিরিয়ে আনতে বললে):
   - উদাহরণ: "আগের কাজটা Undo করো", "undo", "revert", "আগেরটা ফিরিয়ে আনো", "ভুল হয়েছে আগেরটা ফিরিয়ে দাও"
   action: "UNDO"

6. COMPLETE (কোনো কাজ শেষ, হয়ে গেছে বা সম্পন্ন হওয়ার কথা বললে):
   - উদাহরণ: "kaj sesh", "kaj complete", "done", "osudh kheyechi", "meeting done", "কাজ শেষ", "সম্পন্ন"
   action: "COMPLETE"
   content: "সম্পন্ন কাজের বিষয় বা খালি"

7. LIST_NOTES (সেভ করা সব নোট বা তথ্য দেখতে চাইলে):
   - উদাহরণ: "amr sob note dekhaw", "ki ki mone rakhso", "show notes", "সব নোট", "আমার নোটগুলো দেখাও"
   action: "LIST_NOTES"

8. LIST_REMINDERS (সক্রিয় রিমাইন্ডারের তালিকা দেখতে চাইলে):
   - উদাহরণ: "amr reminder list", "ki ki reminder ase", "show reminders", "রিমাইন্ডারগুলো দেখাও"
   action: "LIST_REMINDERS"

9. SEARCH (আগের তথ্য বা নোট খুঁজতে চাইলে):
   - উদাহরণ: "chabi kothay?", "password ki?", "ডাক্তার সম্পর্কিত নোট", "find key"
   action: "SEARCH"
   query: "খোঁজার কিওয়ার্ড"

10. REVIEW (নিজের পার্সোনাল সামারি, উন্নতি বা প্রগ্রেস রিপোর্ট দেখতে চাইলে):
   - উদাহরণ: "amr summary", "review dao", "kothay improve lagbe", "রিভিউ", "সামারি"
   action: "REVIEW"

11. MEMORY_QUERY (আগের কোনো মিটিং, ছবি, ফাইল বা সংরক্ষিত স্মৃতির বিষয়ে নির্দিষ্ট প্রশ্ন করলে):
   - উদাহরণ: "আগের মিটিংয়ে কী সিদ্ধান্ত হয়েছিল?", "ওই ছবিতে কী লেখা আছে?", "আগের ফাইলে কী ছিল?", "আমার সম্পর্কে কী মনে রেখেছো?", "what do you remember about me"
   action: "MEMORY_QUERY"
   memoryType: "meeting" | "image" | "document" | "fact" | "all"
   query: "প্রশ্নের মূল বিষয়"

12. MEMORY_FORGET (কোনো সংরক্ষিত তথ্য বা স্মৃতি মুছে দিতে বা ভুলে যেতে বললে):
   - উদাহরণ: "এই তথ্যটা আর মনে রেখো না", "ভুলে যাও ওই মিটিং", "forget this", "আমার ডাটা ভুলে যাও"
   action: "MEMORY_FORGET"
   targetRef: "যা ভুলে যেতে হবে"

13. REMEMBER_THIS (স্পষ্টভাবে কোনো তথ্য, মিটিং বা সারসংক্ষেপ স্থায়ী মেমরিতে সংরক্ষণ করতে বললে):
   - উদাহরণ: "এটা মনে রাখো", "remember this", "মিটিংয়ের সারসংক্ষেপ মনে রাখো"
   action: "REMEMBER_THIS"
   content: "সংরক্ষণযোগ্য মূল বিষয়"

14. CHAT (প্রশ্ন, অভিবাদন, সাধারণ কথাবার্তা, অনুভূতি প্রকাশ):
   - উদাহরণ: "kemon aso", "tumi k", "dhonnobad", "hi", "কেমন আছো", "আজ অনেক গরম"
   action: "CHAT"
   reply: "সংক্ষিপ্ত, আন্তরিক ও বুদ্ধিদীপ্ত বাংলা উত্তর"

কড়া নির্দেশনা:
- ব্যবহারকারী ডিলিট/মুছতে বললে অবশ্যই action: "DELETE" দেবে। কখনো NOTE হিসেবে ধরবে না!
- এডিট বা পরিবর্তনের কথা বললে action: "UPDATE" দেবে।
- Undo বললে action: "UNDO" দেবে।
- সাধারণ কথা বললে CHAT দেবে। অযথা NOTE বানাবে না!
- স্মৃতি/মিটিং/ছবি সংক্রান্ত প্রশ্ন হলে MEMORY_QUERY দেবে।

আউটপুট শুধু বৈধ JSON অবজেক্ট দাও:
{"action": "NOTE|UPDATE|REMINDER|DELETE|UNDO|COMPLETE|LIST_NOTES|LIST_REMINDERS|SEARCH|REVIEW|MEMORY_QUERY|MEMORY_FORGET|REMEMBER_THIS|CHAT", "resourceType": "note|reminder|all", "memoryType": "meeting|image|document|fact|all", "targetRef": "...", "content": "...", "timeHint": "...", "mode": "append|shorten|replace", "query": "...", "reply": "..."}`;

async function understandConversationalIntent(message) {
  const settings = aiConfig.getSettings();

  // 1. If Local rule engine is selected, skip cloud AI
  if (settings.activeProvider === 'local') {
    return null;
  }

  // 2. OpenAI ChatGPT provider
  if (settings.activeProvider === 'openai') {
    const key = settings.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!key) return null;
    const mod = settings.openaiModel || 'gpt-4o-mini';
    try {
      const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;
      const res = await fetchFn('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: mod,
          messages: [
            { role: 'system', content: CONVERSATIONAL_SYSTEM_PROMPT },
            { role: 'user', content: `ব্যবহারকারীর মেসেজ: "${message}"` }
          ],
          response_format: { type: 'json_object' }
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      console.error('[OpenAI] কনভার্সেশনাল বিশ্লেষণ সমস্যা:', err.message);
      return null;
    }
  }

  // 3. Google Gemini (Default)
  const client = getClient();
  if (!client) return null;

  try {
    const result = await generateWithFallback(client, [
      { text: CONVERSATIONAL_SYSTEM_PROMPT },
      { text: `ব্যবহারকারীর মেসেজ: "${message}"` },
    ]);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[AI] কনভার্সেশনাল বিশ্লেষণ সমস্যা:', err.message);
    return null;
  }
}

/**
 * ছবি বিশ্লেষণ করে রিমাইন্ডার বা নোট শনাক্ত করে (Gemini Vision multimodal)
 * @param {Buffer} imageBuffer - image file buffer
 * @param {string} mimeType
 * @param {string} caption
 * @returns {Promise<{type: 'REMINDER'|'NOTE'|'GENERAL', title?: string, details?: string, timeHint?: string, extractedText?: string, content?: string, description?: string}|null>}
 */
async function analyzeImageForReminderOrNote(imageBuffer, mimeType = 'image/jpeg', caption = '') {
  const client = getClient();
  if (!client) return null;

  const prompt = `তুমি FREND — বাংলা ব্যক্তিগত AI অ্যাসিস্ট্যান্ট ও মেমরি বট।
এই ছবিটি খুব মনোযোগ দিয়ে দেখো এবং বিশ্লেষণ করো।
ব্যবহারকারীর পাঠানো ক্যাপশন (যদি থাকে): "${caption || ''}"

ছবিতে যা দেখা যাচ্ছে তার ভিত্তিতে যেকোনো একটি ক্যাটাগরিতে JSON আউটপুট দাও:

১. যদি ছবিতে কোনো রিমাইন্ডার, করণীয় কাজ, প্রেসক্রিপশনের ওষুধ, বিলের শেষ তারিখ, টিকিট, মিটিং, অ্যাপয়েন্টমেন্ট বা সময়-সম্পর্কিত কিছু থাকে:
{
  "type": "REMINDER",
  "title": "কাজের মূল বিষয় (সংক্ষেপে বাংলায়)",
  "details": "বিস্তারিত বা ওষুধের নিয়ম",
  "timeHint": "সময়ের ইঙ্গিত (যেমন: কাল সকাল ৮টা, আজ রাত ১০টা, ১০ মিনিট পর)",
  "extractedText": "ছবিতে থাকা প্রধান টেক্সট"
}

২. যদি ছবিতে মনে রাখার মতো কোনো তথ্য থাকে (যেমন স্লিপ, ডকুমেন্টের ছবি, জিনিসপত্রের অবস্থান, পাসওয়ার্ড/সিরিয়াল, রসিদ, নোট):
{
  "type": "NOTE",
  "title": "নোটের শিরোনাম",
  "content": "ছবি থেকে মনে রাখার মতো বিস্তারিত সারসংক্ষেপ ও তথ্য"
}

৩. যদি সাধারণ কোনো ছবি হয় (কোনো কাজ বা নোট নেই):
{
  "type": "GENERAL",
  "description": "ছবিতে কী দেখা যাচ্ছে তার সংক্ষিপ্ত বর্ণনা"
}

আউটপুট শুধু বৈধ JSON অবজেক্ট দাও।`;

  try {
    const result = await generateWithFallback(client, [
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: imageBuffer.toString('base64'),
        },
      },
      { text: prompt },
    ]);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[AI] ছবি বিশ্লেষণ সমস্যা:', err.message);
    return null;
  }
}

/**
 * মিটিং ভয়েস ও অডিও রেকর্ডিং বিস্তারিত বিশ্লেষণ (Section 6)
 */
async function analyzeMeetingAudio(audioBuffer, mimeType = 'audio/ogg', instruction = '') {
  const client = getClient();
  if (!client) {
    return {
      transcript: 'অডিও ট্রান্সক্রাইব করার জন্য ক্লাউড এপিআই সংযুক্ত নেই।',
      isMeeting: false,
      title: 'ভয়েস অডিও',
      topics: [],
      decisions: [],
      actionItems: [],
      summary: 'অডিও ফাইল সংরক্ষিত হয়েছে।',
    };
  }

  const prompt = `তুমি FREND-এর ইন্টেলিজেন্ট মিটিং অ্যান্ড অডিও অ্যানালাইজার।
এই অডিও রেকর্ডিংটি অত্যন্ত মনোযোগ দিয়ে শোনো এবং এর সম্পূর্ণ বাংলা ও ইংরেজি ট্রান্সক্রিপশন এবং গুরুত্বপূর্ণ তথ্য বিশ্লেষণ করো।
ব্যবহারকারীর নির্দেশনা (যদি থাকে): "${instruction || ''}"

নিচের JSON ফরম্যাটে উত্তর দাও:
{
  "transcript": "সম্পূর্ণ মুখের কথার পুঙ্খানুপুঙ্খ ট্রান্সক্রিপশন (যথাযথ শব্দ ও অর্থ অক্ষুণ্ণ রেখে)",
  "isMeeting": true,
  "title": "মিটিং বা আলোচনার শিরোনাম",
  "summary": "মিটিংয়ের মূল সারসংক্ষেপ (সংক্ষেপে)",
  "topics": ["আলোচিত মূল বিষয় ১", "আলোচিত মূল বিষয় ২"],
  "decisions": ["গৃহীত সিদ্ধান্ত ১", "গৃহীত সিদ্ধান্ত ২"],
  "actionItems": [
    {"task": "কাজের বিবরণ", "owner": "দায়িত্বপ্রাপ্ত ব্যক্তি (যদি উল্লেখ থাকে)", "deadline": "সময়সীমা (যদি থাকে)"}
  ]
}

শুধু JSON অবজেক্ট দাও। কোনো কিছু বাদ দেবে না বা অনুমান করে বানিয়ে লিখবে না।`;

  try {
    const result = await generateWithFallback(client, [
      {
        inlineData: {
          mimeType: mimeType || 'audio/ogg',
          data: audioBuffer.toString('base64'),
        },
      },
      { text: prompt },
    ], 20000);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error('[AI] মিটিং অডিও বিশ্লেষণ সমস্যা:', err.message);
  }

  const simpleTranscript = await transcribeVoice(audioBuffer, mimeType);
  return {
    transcript: simpleTranscript || 'অডিও রেকর্ড',
    isMeeting: /মিটিং|meeting|সিদ্ধান্ত|decision/i.test(simpleTranscript || instruction),
    title: 'ভয়েস রেকর্ডিং',
    summary: simpleTranscript || '',
    topics: [],
    decisions: [],
    actionItems: [],
  };
}

/**
 * ছবি ও ডকুমেন্ট বিস্তারিত বিশ্লেষণ (Section 7)
 */
async function analyzeDocumentOrImage(buffer, mimeType = 'image/jpeg', instruction = '') {
  const client = getClient();
  if (!client) return null;

  const prompt = `তুমি FREND — বাংলা ব্যক্তিগত AI অ্যাসিস্ট্যান্ট ও ডকুমেন্ট/ভিজ্যুয়াল মেমরি অ্যানালাইজার।
এই ছবিটি বা ডকুমেন্টটি খুব পুঙ্খানুপুঙ্খভাবে দেখো।
ব্যবহারকারীর মন্তব্য/নির্দেশনা: "${instruction || ''}"

নিচের JSON ফরম্যাটে উত্তর দাও:
{
  "documentType": "receipt|prescription|ticket|document|slip|screenshot|photo|other",
  "title": "ডকুমেন্ট বা ছবির উপযুক্ত শিরোনাম",
  "extractedText": "ছবিতে বা ডকুমেন্টে থাকা সম্পূর্ণ দৃশ্যমান টেক্সট (OCR)",
  "summary": "মনে রাখার মতো মূল সারসংক্ষেপ ও তথ্য",
  "keyDetails": {
    "amount": "টাকার পরিমাণ (যদি রসিদ/বিল হয়)",
    "date": "তারিখ/সময় (যদি থাকে)",
    "names": "গুরুত্বপূর্ণ নাম/প্রতিষ্ঠান/ডাক্তার",
    "medicineOrItems": ["ওষুধ বা পণ্যের তালিকা"]
  },
  "visualDetails": "ছবির চাক্ষুষ গঠন ও দৃশ্যমান গুরুত্বপূর্ণ বর্ণনা"
}

শুধু JSON অবজেক্ট দাও।`;

  try {
    const result = await generateWithFallback(client, [
      {
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: buffer.toString('base64'),
        },
      },
      { text: prompt },
    ]);
    const raw = result.response.text().trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[AI] ডকুমেন্ট/ছবি বিশ্লেষণ সমস্যা:', err.message);
    return null;
  }
}

module.exports = {
  analyzeForSmartReminder,
  transcribeVoice,
  understandConversationalIntent,
  analyzeImageForReminderOrNote,
  analyzeMeetingAudio,
  analyzeDocumentOrImage,
  saveMediaAttachment,
};
