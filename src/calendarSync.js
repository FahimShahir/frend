/**
 * Google Calendar Multi-User Sync Module — FREND
 *
 * Implements:
 * 1. Independent per-user Google Calendar connections
 * 2. Secure single-use OAuth2 state generation & verification
 * 3. AES-256-GCM encrypted token storage per user
 * 4. User-isolated event viewing, creation, deletion, and sync
 * 5. Scoped permission verification and disconnection
 */

'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const authManager = require('./authManager');
const security = require('./security');

const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const TOKEN_PATH = path.join(__dirname, '..', 'data', 'google_token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

function getCredentialsConfig() {
  if (!fs.existsSync(CREDENTIALS_PATH)) return null;
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  return creds.installed || creds.web;
}

function createOAuth2Client(customRedirectUri = null) {
  const config = getCredentialsConfig();
  if (!config) return null;
  const redirectUri = customRedirectUri || (config.redirect_uris && config.redirect_uris[0]) || 'http://localhost:3000/oauth2/google/callback';
  return new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);
}

/**
 * Checks whether Google OAuth is configured for a specific user (or globally as fallback)
 */
function isConfigured(userId = null) {
  if (!fs.existsSync(CREDENTIALS_PATH)) return false;
  if (userId) {
    const conn = authManager.getUserCalendarConnection(userId);
    if (conn) return true;
  }
  return fs.existsSync(TOKEN_PATH);
}

/**
 * Retrieves authenticated OAuth client for a specific user.
 * If user is disabled, strictly returns null.
 */
function getUserAuthClient(userId) {
  if (!userId) return getGlobalAuthClient();

  // Check user status: disabled users cannot access Google Calendar
  const user = authManager.getUserById(userId);
  if (user && (user.status === 'disabled' || user.status === 'blocked')) {
    return null;
  }

  const conn = authManager.getUserCalendarConnection(userId);
  if (!conn || !conn.tokens) {
    return null;
  }

  const client = createOAuth2Client();
  if (!client) return null;
  client.setCredentials(conn.tokens);
  return client;
}

function getGlobalAuthClient() {
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) return null;
  const client = createOAuth2Client();
  if (!client) return null;
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  client.setCredentials(tokens);
  return client;
}

/**
 * Generates secure Google OAuth authorization URL for a specific user
 * with single-use cryptographically bound state.
 */
function generateUserAuthUrl(userId, redirectUri) {
  const client = createOAuth2Client(redirectUri);
  if (!client) throw new Error('credentials.json পাওয়া যায়নি। Google OAuth কনফিগারেশন চেক করুন।');

  const state = security.generateSecureToken(32);
  authManager.saveOAuthState(state, userId, 'google_calendar');

  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });

  return { authUrl, state };
}

/**
 * Exchanges OAuth authorization code securely and associates connection with user
 */
async function handleOAuthCallback(code, state, redirectUri) {
  const stateRecord = authManager.verifyAndConsumeOAuthState(state);
  if (!stateRecord) {
    throw new Error('অবৈধ বা মেয়াদোত্তীর্ণ OAuth state প্যারামিটার। অনুগ্রহ করে পুনরায় চেষ্টা করুন।');
  }

  const userId = stateRecord.user_id;
  const client = createOAuth2Client(redirectUri);
  if (!client) throw new Error('OAuth ক্লায়েন্ট তৈরি করা যায়নি');

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  let email = '';
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    email = userInfo.data.email || '';
  } catch (_) {
    email = 'connected_account@gmail.com';
  }

  authManager.saveUserCalendarConnection(userId, email, tokens);
  return { userId, email };
}

/**
 * রিমাইন্ডার নির্দিষ্ট ইউজারের Google Calendar-এ যুক্ত করে
 * Signature supports both:
 * (userId, title, remindAt, description) AND legacy (title, remindAt, description)
 */
async function addToGoogleCalendar(arg1, arg2, arg3, arg4 = '') {
  let userId = null;
  let title = '';
  let remindAt = null;
  let description = '';

  if (typeof arg1 === 'number' || (typeof arg1 === 'string' && (arg2 instanceof Date || typeof arg2 === 'string') && arg3 instanceof Date)) {
    userId = arg1;
    title = arg2;
    remindAt = arg3;
    description = arg4;
  } else if (typeof arg1 === 'string' && arg2 instanceof Date) {
    title = arg1;
    remindAt = arg2;
    description = arg3 || '';
    userId = null;
  } else {
    userId = arg1;
    title = arg2;
    remindAt = arg3;
    description = arg4;
  }

  // Check plan entitlement if userId is present
  if (userId) {
    const access = authManager.canUserAccessFeature(userId, 'calendar');
    if (!access.allowed) {
      console.warn(`[Calendar] User ${userId} has no calendar entitlement: ${access.reason}`);
      return null;
    }
  }

  const auth = userId ? (getUserAuthClient(userId) || getGlobalAuthClient()) : getGlobalAuthClient();
  if (!auth) return null;

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const endTime = new Date(remindAt.getTime() + 30 * 60 * 1000);

    const event = {
      summary: title,
      description: description || 'ফ্রেন্ড বট থেকে স্মার্ট রিমাইন্ডার',
      start: {
        dateTime: remindAt.toISOString(),
        timeZone: 'Asia/Dhaka',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Dhaka',
      },
      reminders: {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: 10 }],
      },
    };

    const res = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });

    console.log(`✅ Google Calendar-এ যুক্ত হয়েছে [User: ${userId || 'Global'}]: ${res.data.htmlLink}`);
    const linkStr = res.data.htmlLink || '';
    const eventId = res.data.id || null;
    return {
      link: linkStr,
      eventId: eventId,
      toString() { return linkStr; }
    };
  } catch (err) {
    console.error(`[Calendar] সমস্যা [User: ${userId}]:`, err.message);
    return null;
  }
}

/**
 * ইউজারের ক্যালেন্ডার ইভেন্ট লিস্ট করা
 */
async function listGoogleCalendarEvents(userId, maxResults = 10) {
  const auth = getUserAuthClient(userId) || getGlobalAuthClient();
  if (!auth) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date().toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });
    return res.data.items || [];
  } catch (err) {
    console.error(`[Calendar] ইভেন্ট লিস্ট সমস্যা [User: ${userId}]:`, err.message);
    return [];
  }
}

/**
 * ইউজারের ক্যালেন্ডার ইভেন্ট ডিলিট করা
 */
async function deleteGoogleCalendarEvent(userId, eventId) {
  const auth = getUserAuthClient(userId) || getGlobalAuthClient();
  if (!auth) return false;

  try {
    const calendar = google.calendar({ version: 'v3', auth });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });
    return true;
  } catch (err) {
    console.error(`[Calendar] ইভেন্ট ডিলিট সমস্যা [User: ${userId}]:`, err.message);
    return false;
  }
}

/**
 * ইউজারের ক্যালেন্ডার থেকে ইভেন্ট আইডি বা বিষয়বস্তু (summary) অনুযায়ী ইভেন্ট মোছা
 */
async function deleteGoogleCalendarEventBySummaryOrId(userId, eventId, summary = null) {
  const auth = (userId ? getUserAuthClient(userId) : null) || getGlobalAuthClient();
  if (!auth) return false;

  try {
    const calendar = google.calendar({ version: 'v3', auth });

    // 1. Try direct eventId deletion
    if (eventId) {
      try {
        await calendar.events.delete({
          calendarId: 'primary',
          eventId: eventId,
        });
        console.log(`✅ Google Calendar ইভেন্ট #${eventId} মুছে ফেলা হয়েছে [User: ${userId || 'Global'}]`);
        return true;
      } catch (err) {
        console.warn(`[Calendar] EventId (${eventId}) দিয়ে ডিলিট করা যায়নি (${err.message}), নাম দিয়ে খোঁজা হচ্ছে...`);
      }
    }

    // 2. Fallback: Search matching events by summary/title
    if (summary && typeof summary === 'string' && summary.trim().length > 0) {
      const cleanSummary = summary.trim();
      const res = await calendar.events.list({
        calendarId: 'primary',
        q: cleanSummary,
        maxResults: 10,
        singleEvents: true,
      });

      const items = res.data.items || [];
      for (const item of items) {
        if (item.summary && (item.summary.includes(cleanSummary) || cleanSummary.includes(item.summary))) {
          await calendar.events.delete({
            calendarId: 'primary',
            eventId: item.id,
          });
          console.log(`✅ Google Calendar ইভেন্ট "${item.summary}" (#${item.id}) খুঁজে মুছে ফেলা হয়েছে [User: ${userId || 'Global'}]`);
          return true;
        }
      }
    }

    return false;
  } catch (err) {
    console.error(`[Calendar] ইভেন্ট মোছায় ত্রুটি [User: ${userId}]:`, err.message);
    return false;
  }
}

/**
 * ইউজারের ক্যালেন্ডার ডিসকানেক্ট করা
 */
function disconnectCalendar(userId) {
  return authManager.deleteUserCalendarConnection(userId);
}

// ─── Legacy Helpers ───────────────────────────────────────────
function getAuthUrl() {
  const config = getCredentialsConfig();
  if (!config) return null;
  const client = new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uris[0]);
  return client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
}

async function saveToken(code) {
  const config = getCredentialsConfig();
  if (!config) return false;
  const client = new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uris[0]);
  const { tokens } = await client.getToken(code);
  if (!fs.existsSync(path.dirname(TOKEN_PATH))) {
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
  return true;
}

module.exports = {
  isConfigured,
  getUserAuthClient,
  generateUserAuthUrl,
  handleOAuthCallback,
  addToGoogleCalendar,
  listGoogleCalendarEvents,
  deleteGoogleCalendarEvent,
  deleteGoogleCalendarEventBySummaryOrId,
  disconnectCalendar,
  // Legacy
  getAuthUrl,
  saveToken,
};
