/**
 * Parse Bengali/English time expressions with robust Asia/Dhaka timezone handling.
 * Examples: "৩ ঘণ্টা পরে", "কাল সকাল ১০টায়", "আগামীকাল", "30 minutes", "2 hours", "in 2 minutes"
 */

'use strict';

const chrono = require('chrono-node');

const DHAKA_TIMEZONE = 'Asia/Dhaka';
const DHAKA_OFFSET_HOURS = 6; // Asia/Dhaka is strictly UTC+6 (no Daylight Saving Time)

// Bengali digit map
const bnDigits = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

function convertBnDigits(str) {
  if (!str) return '';
  return String(str).replace(/[০-৯]/g, d => bnDigits[d] || d);
}

/**
 * Returns the current date/time broken down in Asia/Dhaka timezone.
 */
function getDhakaNow(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DHAKA_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = parseInt(p.value, 10);
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Creates an absolute UTC Date for a given year, month (1-12), day, hour (0-23), minute (0-59) in Asia/Dhaka.
 * Immune to the host system's local timezone!
 */
function createDhakaDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - DHAKA_OFFSET_HOURS, minute, second, 0));
}

// Bengali & Banglish keyword → minute offset
const KEYWORD_MINUTES = {
  'এখনই': 1, 'এখন': 1, 'ekhon': 1, 'ekhoni': 1, 'now': 1,
  '১ মিনিট': 1, '৫ মিনিট': 5, '১০ মিনিট': 10, '১৫ মিনিট': 15, '৩০ মিনিট': 30,
  '1 min': 1, '2 min': 2, '5 min': 5, '10 min': 10, '15 min': 15, '30 min': 30,
  '১ ঘন্টা': 60, '১ ঘণ্টা': 60, '১ ঘণ্টায়': 60, '২ ঘণ্টা': 120, '৩ ঘণ্টা': 180,
  '1 ghonta': 60, '2 ghonta': 120, '3 ghonta': 180,
  'আধা ঘণ্টা': 30, 'আধঘণ্টা': 30, 'adha ghonta': 30, 'half hour': 30,
};

const BN_TIME_PATTERNS = [
  // "X ঘণ্টা পরে/পর" or "X ghonta por/pore" or "X hours"
  { regex: /([০-৯\d]+)\s*(?:ঘ[নণ][্ট]া|ghonta|ghontay|hour|hours|hr|hrs)\s*(?:পর[ে]?|por|pore|after|later)?/iu, unit: 'hour' },
  // "X মিনিট পরে/পর" or "X minute por/pore" or "X mins"
  { regex: /([০-৯\d]+)\s*(?:মিনিট|minute|minutes|min|mins|m)\s*(?:পর[ে]?|por|pore|after|later)?/iu, unit: 'minute' },
  // "in X minutes" / "after X minutes"
  { regex: /(?:in|after)\s*([০-৯\d]+)\s*(?:minutes?|mins?|m)/iu, unit: 'minute' },
  // "in X hours" / "after X hours"
  { regex: /(?:in|after)\s*([০-৯\d]+)\s*(?:hours?|hrs?|h)/iu, unit: 'hour' },
  // "X দিন পরে/পর" or "X din por/pore" or "X days"
  { regex: /([০-৯\d]+)\s*(?:দিন|din|day|days)\s*(?:পর[ে]?|por|pore|after|later)?/iu, unit: 'day' },
  // "কাল" / "kal" / "tomorrow"
  { regex: /(?:^|\s)(?:কাল|kal|kaal|kalka|kalke|tomorrow)(?:\s|$|[^\w])/iu, unit: 'tomorrow' },
  // "পরশু" / "porshu" / "day after tomorrow"
  { regex: /(?:^|\s)(?:পরশু|porshu|porsu|porso)(?:\s|$|[^\w])/iu, unit: 'dayafter' },
];

function parseClockTime(text) {
  const norm = convertBnDigits(text).toLowerCase();
  // Look for clock indicators: sokal, shokal, raat, bikal, dupur, sondha, am, pm, tay, ta, baje, or HH:mm format
  const clockMatch = norm.match(/(?:(sokal|shokal|morning|dupur|noon|bikal|afternoon|sondha|shondha|evening|raat|night)\s*)?([0-9]{1,2})(?::([0-9]{2}))?\s*(tay|ta|am|pm|baje|টায়|টা)?/i);
  if (!clockMatch) return null;

  const period = clockMatch[1] || '';
  const hrRaw = clockMatch[2];
  const minRaw = clockMatch[3];
  const suffix = clockMatch[4] || '';

  // Require either a period, suffix, or colon minute indicator to avoid false matching generic numbers
  if (!period && !suffix && !minRaw && !/(?:সকাল|রাত|দুপুর|বিকাল|সন্ধ্যা|টায়|টা|am|pm)/i.test(text)) {
    return null;
  }

  let hr = parseInt(hrRaw, 10);
  let min = minRaw ? parseInt(minRaw, 10) : 0;

  if (isNaN(hr) || hr < 0 || hr > 23 || min < 0 || min > 59) return null;

  const isPm = /pm|dupur|noon|bikal|afternoon|sondha|shondha|evening|raat|night|রাত|দুপুর|বিকাল|সন্ধ্যা/i.test(norm) ||
               /pm|dupur|noon|bikal|afternoon|sondha|shondha|evening|raat|night/i.test(period);
  const isAm = /am|sokal|shokal|morning|সকাল/i.test(norm) ||
               /am|sokal|shokal|morning/i.test(period);

  if (isPm && hr < 12) {
    hr += 12;
  } else if (isAm && hr === 12) {
    hr = 0;
  }

  return { hr, min };
}

function parseTime(text) {
  if (!text) return null;
  const now = new Date();
  const lower = text.toLowerCase();
  const dhakaNow = getDhakaNow(now);

  // 1. Check exact relative keywords ("এখনই", "1 min", "5 min", "adha ghonta")
  for (const [key, minutes] of Object.entries(KEYWORD_MINUTES)) {
    if (lower.includes(key.toLowerCase())) {
      return new Date(Date.now() + minutes * 60 * 1000);
    }
  }

  // 2. Check relative minute/hour/day patterns ("X মিনিট পর", "in X minutes", "X ghonta por")
  for (const pat of BN_TIME_PATTERNS) {
    const match = text.match(pat.regex);
    if (match) {
      const num = match[1] ? parseInt(convertBnDigits(match[1]), 10) : 1;

      if (pat.unit === 'minute') {
        return new Date(Date.now() + num * 60 * 1000);
      } else if (pat.unit === 'hour') {
        return new Date(Date.now() + num * 3600 * 1000);
      } else if (pat.unit === 'day') {
        return new Date(Date.now() + num * 86400 * 1000);
      } else if (pat.unit === 'tomorrow') {
        const clock = parseClockTime(text);
        const hr = clock ? clock.hr : 9; // default: 9 AM
        const min = clock ? clock.min : 0;
        return createDhakaDate(dhakaNow.year, dhakaNow.month, dhakaNow.day + 1, hr, min, 0);
      } else if (pat.unit === 'dayafter') {
        const clock = parseClockTime(text);
        const hr = clock ? clock.hr : 9;
        const min = clock ? clock.min : 0;
        return createDhakaDate(dhakaNow.year, dhakaNow.month, dhakaNow.day + 2, hr, min, 0);
      }
    }
  }

  // 3. Clock time today / tomorrow in Asia/Dhaka ("রাত ১০টায়", "sokal 8 tay", "10:30 pm")
  const clock = parseClockTime(text);
  if (clock) {
    const todayTarget = createDhakaDate(dhakaNow.year, dhakaNow.month, dhakaNow.day, clock.hr, clock.min, 0);
    if (todayTarget.getTime() > now.getTime()) {
      return todayTarget;
    }
    // If the time today in Dhaka has already passed, schedule for tomorrow in Dhaka
    return createDhakaDate(dhakaNow.year, dhakaNow.month, dhakaNow.day + 1, clock.hr, clock.min, 0);
  }

  // 4. Fallback: chrono-node (English relative or absolute)
  const englishText = convertBnDigits(text);
  const parsed = chrono.parseDate(englishText);
  if (parsed && parsed.getTime() > now.getTime()) {
    return parsed;
  }

  return null;
}

function formatTime(date) {
  if (!date) return '';
  const d = (date instanceof Date) ? date : new Date(date);
  return d.toLocaleString('bn-BD', {
    timeZone: DHAKA_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRelativeTime(date) {
  if (!date) return '';
  const d = (date instanceof Date) ? date : new Date(date);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'এখনই';
  if (diffMin < 60) return `${diffMin} মিনিট পরে`;
  if (diffHr < 24) return `${diffHr} ঘণ্টা পরে`;
  if (diffDay === 1) return 'কাল';
  if (diffDay === 2) return 'পরশু';
  return `${diffDay} দিন পরে`;
}

module.exports = {
  parseTime,
  formatTime,
  formatRelativeTime,
  convertBnDigits,
  getDhakaNow,
  createDhakaDate,
  DHAKA_TIMEZONE,
};
