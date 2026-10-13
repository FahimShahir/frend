/**
 * Feature Flags & Safe Canary Rollout Engine — FREND
 * 
 * Supports:
 * 1. Zero-Disruption dynamic feature toggling without restarting the application.
 * 2. Instant kill-switches to isolate buggy features or regressions.
 * 3. Persistence via SQLite database (system_feature_flags).
 */

'use strict';

const db = require('./database');

// In-Memory cache for low-latency checks
const flagsCache = new Map();

// Default baseline flags
const DEFAULT_FLAGS = [
  {
    key: 'ai_smart_reminders',
    name: 'Smart AI Reminder Engine',
    description: 'স্বয়ংক্রিয় এআই রিমাইন্ডার ডিটেকশন ও শিডিউলিং',
    enabled: 1,
    risk_level: 'LOW_RISK'
  },
  {
    key: 'dynamic_math_eval',
    name: 'Dynamic Arithmetic Computation',
    description: 'নোট না বানিয়ে সরাসরি গাণিতিক হিসাব সমাধান',
    enabled: 1,
    risk_level: 'LOW_RISK'
  },
  {
    key: 'google_calendar_sync',
    name: 'Google Calendar Integration',
    description: 'দ্বিমুখী গুগল ক্যালেন্ডার ইভেন্ট সিঙ্ক ও OAuth',
    enabled: 1,
    risk_level: 'LOW_RISK'
  },
  {
    key: 'voice_transcription',
    name: 'Voice & Audio Transcription',
    description: 'ভয়েস অডিও ফাইল এবং মিটিং নোট প্রসেসিং',
    enabled: 1,
    risk_level: 'LOW_RISK'
  },
  {
    key: 'vision_processing',
    name: 'Image & Document Vision',
    description: 'ছবি, বিল ও ডকুমেন্ট থেকে তথ্য নিষ্কাশন',
    enabled: 1,
    risk_level: 'LOW_RISK'
  },
  {
    key: 'canary_proactive_evolution',
    name: 'Proactive AI Self-Evolution Engine',
    description: 'স্বয়ংক্রিয় রিগ্রেশন ডিটেকশন, টেস্ট-ব্যাকড প্যাচিং ও অটো-রোলব্যাক',
    enabled: 1,
    risk_level: 'LOW_RISK'
  }
];

function initFeatureFlags() {
  try {
    for (const def of DEFAULT_FLAGS) {
      const existing = db.getFeatureFlag(def.key);
      if (!existing) {
        db.setFeatureFlag(def.key, def.name, def.description, def.enabled, def.risk_level, {});
        flagsCache.set(def.key, Boolean(def.enabled));
      } else {
        flagsCache.set(def.key, existing.enabled);
      }
    }
  } catch (err) {
    console.warn('[FeatureFlags] Initialization warning:', err.message);
  }
}

// Initialize on module load
initFeatureFlags();

/**
 * Check if a feature is enabled
 */
function isEnabled(key, defaultValue = true) {
  if (flagsCache.has(key)) {
    return flagsCache.get(key);
  }
  try {
    const flag = db.getFeatureFlag(key);
    if (flag) {
      flagsCache.set(key, flag.enabled);
      return flag.enabled;
    }
  } catch (_) {}
  return defaultValue;
}

/**
 * Enable a feature flag
 */
function enable(key, metadata = {}) {
  flagsCache.set(key, true);
  db.setFeatureFlag(key, key, '', 1, 'LOW_RISK', metadata);
  return true;
}

/**
 * Disable a feature flag (Emergency Kill-Switch)
 */
function disable(key, metadata = {}) {
  flagsCache.set(key, false);
  db.setFeatureFlag(key, key, '', 0, 'LOW_RISK', metadata);
  return true;
}

/**
 * Get all feature flags
 */
function getAll() {
  try {
    return db.getAllFeatureFlags();
  } catch (_) {
    return DEFAULT_FLAGS.map(f => ({ ...f, enabled: Boolean(f.enabled) }));
  }
}

module.exports = {
  isEnabled,
  enable,
  disable,
  getAll,
  initFeatureFlags,
};
