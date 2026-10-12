/**
 * Google Calendar One-time Setup Script
 * চালাও: node setup-calendar.js
 */

'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'data', 'google_token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
];

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error('\n❌ credentials.json পাওয়া গেল না!\n');
  console.log('নিচের পদক্ষেপগুলো অনুসরণ করো:');
  console.log('1. https://console.cloud.google.com যাও');
  console.log('2. নতুন Project তৈরি করো');
  console.log('3. APIs & Services → Library → Google Calendar API → Enable');
  console.log('4. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID');
  console.log('5. Application type: Desktop app');
  console.log('6. Download JSON → "credentials.json" নামে এই ফোল্ডারে রাখো');
  console.log('7. আবার চালাও: node setup-calendar.js\n');
  process.exit(1);
}

const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;

const oAuth2Client = new google.auth.OAuth2(
  client_id, client_secret, 'http://localhost:3939/oauth2callback'
);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('\n📅 Google Calendar সেটআপ\n');
console.log('নিচের লিংকে browser-এ যাও এবং login করো:\n');
console.log(authUrl);
console.log('\n(login করার পরে স্বয়ংক্রিয়ভাবে token সেভ হবে)\n');

// Start a local server to receive OAuth callback
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  if (parsed.pathname !== '/oauth2callback') {
    res.end('Not found');
    return;
  }

  const code = parsed.query.code;
  if (!code) {
    res.end('❌ Code পাওয়া গেল না।');
    return;
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    if (!fs.existsSync(path.dirname(TOKEN_PATH))) {
      fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    }
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <html><body style="font-family:Arial;text-align:center;padding:50px">
        <h1>✅ সফল!</h1>
        <p>Google Calendar যুক্ত হয়েছে।<br>এই উইন্ডো বন্ধ করে terminal-এ ফিরে যাও।</p>
      </body></html>
    `);

    console.log('✅ Google Calendar সংযুক্ত হয়েছে!');
    console.log(`Token সেভ হয়েছে: ${TOKEN_PATH}`);
    console.log('\nএখন বট চালাও: npm start\n');

    server.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Token সমস্যা:', err.message);
    res.end('❌ সমস্যা হয়েছে। আবার চেষ্টা করো।');
    server.close();
    process.exit(1);
  }
});

server.listen(3939, () => {
  console.log('🔄 Callback server চালু (port 3939)...');
  console.log('browser-এ login করো → স্বয়ংক্রিয়ভাবে সেটআপ হবে।\n');
});
