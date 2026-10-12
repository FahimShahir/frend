/**
 * Multi-AI Model & API Management Engine — FREND
 * ড্যাশবোর্ড থেকে Google Gemini, OpenAI (ChatGPT), বা লোকাল এআই কনফিগার ও টেস্ট করার ব্যবস্থা।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const dbPath = path.join(__dirname, '..', 'data', 'frend.db');
const db = new Database(dbPath);

// ─── Table Initialization ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_ai_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL
  );
`);

function getSetting(key, defaultValue = '') {
  try {
    const row = db.prepare('SELECT setting_value FROM bot_ai_settings WHERE setting_key = ?').get(key);
    return row ? row.setting_value : defaultValue;
  } catch (_) {
    return defaultValue;
  }
}

function setSetting(key, value) {
  try {
    db.prepare(`
      INSERT INTO bot_ai_settings (setting_key, setting_value)
      VALUES (?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value
    `).run(key, String(value));
  } catch (err) {
    console.error('[AiConfig] setSetting error:', err.message);
  }
}

/**
 * বর্তমান এআই সেটিংস উদ্ধার
 */
function getSettings() {
  return {
    activeProvider: getSetting('active_provider', 'gemini'), // 'gemini' | 'openai' | 'local'
    geminiApiKey: getSetting('gemini_api_key', process.env.GEMINI_API_KEY || ''),
    geminiModel: getSetting('gemini_model', process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'),
    openaiApiKey: getSetting('openai_api_key', process.env.OPENAI_API_KEY || ''),
    openaiModel: getSetting('openai_model', 'gpt-4o-mini'),
  };
}

/**
 * ড্যাশবোর্ড থেকে এআই সেটিংস আপডেট
 */
function updateSettings(patch) {
  if (patch.activeProvider !== undefined) {
    setSetting('active_provider', patch.activeProvider);
  }
  if (patch.geminiApiKey !== undefined) {
    setSetting('gemini_api_key', patch.geminiApiKey.trim());
    process.env.GEMINI_API_KEY = patch.geminiApiKey.trim();
  }
  if (patch.geminiModel !== undefined) {
    setSetting('gemini_model', patch.geminiModel.trim());
    process.env.GEMINI_MODEL = patch.geminiModel.trim();
  }
  if (patch.openaiApiKey !== undefined) {
    setSetting('openai_api_key', patch.openaiApiKey.trim());
    process.env.OPENAI_API_KEY = patch.openaiApiKey.trim();
  }
  if (patch.openaiModel !== undefined) {
    setSetting('openai_model', patch.openaiModel.trim());
  }
  return getSettings();
}

/**
 * ড্যাশবোর্ড থেকে রিয়েলটাইমে API কানেকশন টেস্ট করা
 */
async function testConnection(provider, apiKey, model) {
  const t0 = Date.now();
  const prov = (provider || 'gemini').toLowerCase();

  if (prov === 'local') {
    return {
      success: true,
      message: 'লোকাল রুল-বেসড এআই সক্রিয় (কোনো API কি প্রয়োজন নেই)।',
      latencyMs: 1,
    };
  }

  if (prov === 'gemini') {
    const key = apiKey || getSettings().geminiApiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API Key প্রদান করা হয়নি');
    const mod = model || getSettings().geminiModel || 'gemini-3.5-flash-lite';

    const genAI = new GoogleGenerativeAI(key);
    const m = genAI.getGenerativeModel({ model: mod });
    const res = await m.generateContent('Say OK in 1 word');
    const reply = res.response.text().trim();
    return {
      success: true,
      message: `Google Gemini (${mod}) কানেকশন সফল! রেসপন্স: "${reply}"`,
      latencyMs: Date.now() - t0,
    };
  }

  if (prov === 'openai') {
    const key = apiKey || getSettings().openaiApiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API Key প্রদান করা হয়নি');
    const mod = model || getSettings().openaiModel || 'gpt-4o-mini';

    const fetchFn = typeof fetch === 'function' ? fetch : (await import('node-fetch')).default;

    const response = await fetchFn('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: mod,
        messages: [{ role: 'user', content: 'Say OK in 1 word' }],
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI HTTP ${response.status}: ${errBody.slice(0, 150)}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'OK';
    return {
      success: true,
      message: `OpenAI (${mod}) কানেকশন সফল! রেসপন্স: "${reply}"`,
      latencyMs: Date.now() - t0,
    };
  }

  throw new Error(`অপরিচিত প্রোভাইডার: ${provider}`);
}

module.exports = {
  getSettings,
  updateSettings,
  testConnection,
};
