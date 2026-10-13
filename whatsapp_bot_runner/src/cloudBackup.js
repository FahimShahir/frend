/**
 * Cloud Backup Module — Frend Bot
 * রিমাইন্ডার, নোট ও সব ডেটা Google Drive ও লোকাল ক্লাউড ডিরেক্টরিতে ব্যাকআপ রাখা।
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'frend.db');
const CREDENTIALS_PATH = path.join(__dirname, '..', 'credentials.json');
const TOKEN_PATH = path.join(DATA_DIR, 'google_token.json');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * লোকাল আইপি অ্যাড্রেস বের করা
 */
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

/**
 * Windows / Mac / Linux এ Microsoft OneDrive ব্যাকআপ ফোল্ডার খুঁজে বের করা
 */
function getOneDriveBackupFolder() {
  const possiblePaths = [
    process.env.OneDrive,
    process.env.OneDriveConsumer,
    process.env.OneDriveCommercial,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'OneDrive') : null,
    process.env.HOME ? path.join(process.env.HOME, 'OneDrive') : null,
  ].filter(Boolean);

  for (const root of possiblePaths) {
    try {
      if (fs.existsSync(root)) {
        const backupDir = path.join(root, 'FREND_Backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        return backupDir;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Google Drive Desktop ক্লায়েন্ট ডিরেক্টরি খুঁজে বের করা
 */
function getGoogleDriveLocalFolder() {
  const possiblePaths = [
    'G:\\My Drive',
    'G:\\',
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Google Drive') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Google Drive\\My Drive') : null,
    process.env.HOME ? path.join(process.env.HOME, 'Google Drive') : null,
  ].filter(Boolean);

  for (const root of possiblePaths) {
    try {
      if (fs.existsSync(root)) {
        const backupDir = path.join(root, 'FREND_Backups');
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        return backupDir;
      }
    } catch (_) {}
  }
  return null;
}

/**
 * Google Drive Client তৈরি করা (যদি credentials ও token থাকে)
 */
function getDriveClient() {
  if (!fs.existsSync(CREDENTIALS_PATH) || !fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  try {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    const { client_id, client_secret } = creds.installed || creds.web || {};

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      'http://localhost:3939/oauth2callback'
    );
    oAuth2Client.setCredentials(tokens);

    return google.drive({ version: 'v3', auth: oAuth2Client });
  } catch (err) {
    console.error('Google Drive ক্লায়েন্ট তৈরিতে সমস্যা:', err.message);
    return null;
  }
}

/**
 * পুরো ডেটাবেসের সব টেবিল এক্সপোর্ট করে একটি JSON অবজেক্ট তৈরি করা
 */
function generateFullBackupData(userId = null) {
  const db = new Database(DB_PATH, { readonly: true });
  try {
    const backup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      notes: userId
        ? db.prepare('SELECT * FROM notes WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM notes').all(),
      reminders: userId
        ? db.prepare('SELECT * FROM reminders WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM reminders').all(),
      gamification: userId
        ? db.prepare('SELECT * FROM user_gamification WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM user_gamification').all(),
      badges: userId
        ? db.prepare('SELECT * FROM user_badges WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM user_badges').all(),
      completedTasks: userId
        ? db.prepare('SELECT * FROM completed_tasks WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM completed_tasks').all(),
      locationReminders: userId
        ? db.prepare('SELECT * FROM location_reminders WHERE user_id = ?').all(userId)
        : (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='location_reminders'").get()
            ? db.prepare('SELECT * FROM location_reminders').all()
            : []),
      analyticsEvents: userId
        ? db.prepare('SELECT * FROM analytics_events WHERE user_id = ?').all(userId)
        : db.prepare('SELECT * FROM analytics_events').all(),
    };
    return backup;
  } finally {
    db.close();
  }
}

/**
 * Google Drive-এ 'FREND_Backups' ফোল্ডার খুঁজে বের করা বা তৈরি করা
 */
async function getOrCreateDriveFolder(drive) {
  try {
    const query = "name = 'FREND_Backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const res = await drive.files.list({ q: query, fields: 'files(id, name)' });
    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const folder = await drive.files.create({
      requestBody: {
        name: 'FREND_Backups',
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });
    return folder.data.id;
  } catch (err) {
    console.error('Google Drive ফোল্ডার তৈরিতে সমস্যা:', err.message);
    return null;
  }
}

/**
 * লোকাল, OneDrive এবং Google Drive-এ ক্লাউড ব্যাকআপ এক্সিকিউট করা
 */
async function createCloudBackup(userId = null) {
  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `frend_backup_${dateStr}.json`;
  const localFilePath = path.join(BACKUP_DIR, fileName);

  // ১. সম্পূর্ণ ডেটাবেসের ব্যাকআপ ডেটা তৈরি
  const data = generateFullBackupData(userId);
  fs.writeFileSync(localFilePath, JSON.stringify(data, null, 2), 'utf8');

  // ২. পুরনো লোকাল ব্যাকআপ রোটেট করা (সর্বোচ্চ ১০টি লোকাল ব্যাকআপ রাখা)
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('frend_backup_') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length > 10) {
      for (const oldFile of files.slice(10)) {
        fs.unlinkSync(path.join(BACKUP_DIR, oldFile));
      }
    }
  } catch (_) {}

  // ৩. Microsoft OneDrive সিঙ্ক
  let oneDriveSynced = false;
  let oneDrivePath = null;
  const oneDriveFolder = getOneDriveBackupFolder();
  if (oneDriveFolder) {
    try {
      const destFile = path.join(oneDriveFolder, fileName);
      fs.copyFileSync(localFilePath, destFile);
      oneDriveSynced = true;
      oneDrivePath = destFile;
      console.log(`☁️ Microsoft OneDrive-এ ব্যাকআপ কপি সম্পন্ন: ${destFile}`);

      // OneDrive-এও ১০টির বেশি পুরনো ফাইল রোটেট করা
      const odFiles = fs.readdirSync(oneDriveFolder)
        .filter(f => f.startsWith('frend_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (odFiles.length > 10) {
        for (const oldFile of odFiles.slice(10)) {
          try { fs.unlinkSync(path.join(oneDriveFolder, oldFile)); } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('OneDrive কপি সমস্যা:', err.message);
    }
  }

  // ৪. Google Drive Desktop লোকাল সিঙ্ক
  let gDriveLocalSynced = false;
  let gDriveLocalPath = null;
  const gDriveFolder = getGoogleDriveLocalFolder();
  if (gDriveFolder) {
    try {
      const destFile = path.join(gDriveFolder, fileName);
      fs.copyFileSync(localFilePath, destFile);
      gDriveLocalSynced = true;
      gDriveLocalPath = destFile;
      console.log(`☁️ Google Drive ফোল্ডারে ব্যাকআপ কপি সম্পন্ন: ${destFile}`);

      // Google Drive ফোল্ডারেও রোটেট করা
      const gdFiles = fs.readdirSync(gDriveFolder)
        .filter(f => f.startsWith('frend_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (gdFiles.length > 10) {
        for (const oldFile of gdFiles.slice(10)) {
          try { fs.unlinkSync(path.join(gDriveFolder, oldFile)); } catch (_) {}
        }
      }
    } catch (err) {
      console.warn('Google Drive লোকাল ফোল্ডার কপি সমস্যা:', err.message);
    }
  }

  // ৫. Google Drive Cloud API আপলোড চেষ্টা
  const drive = getDriveClient();
  let driveUploaded = false;
  let driveFileLink = null;
  let driveError = null;

  if (drive) {
    try {
      const folderId = await getOrCreateDriveFolder(drive);
      const fileMetadata = {
        name: fileName,
        parents: folderId ? [folderId] : [],
      };
      const media = {
        mimeType: 'application/json',
        body: fs.createReadStream(localFilePath),
      };

      const driveRes = await drive.files.create({
        requestBody: fileMetadata,
        media,
        fields: 'id, webViewLink',
      });

      driveUploaded = true;
      driveFileLink = driveRes.data.webViewLink;
      console.log(`☁️ Google Drive ক্লাউডে সরাসরি আপলোড সম্পন্ন: ${fileName}`);
    } catch (err) {
      driveError = err.message;
      console.warn('Google Drive API আপলোড ব্যর্থ (লোকালে সংরক্ষিত):', err.message);
    }
  }

  return {
    success: true,
    fileName,
    localFilePath,
    totalNotes: data.notes.length,
    totalReminders: data.reminders.length,
    totalCompleted: data.completedTasks.length,
    oneDriveSynced,
    oneDrivePath,
    gDriveLocalSynced,
    gDriveLocalPath,
    driveUploaded,
    driveFileLink,
    driveError,
  };
}

/**
 * ব্যাকআপ থেকে রিস্টোর করা
 */
function restoreFromBackupFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('ব্যাকআপ ফাইলটি পাওয়া যায়নি!');
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const backup = JSON.parse(raw);

  const db = new Database(DB_PATH);
  const restoreTx = db.transaction(() => {
    // Restore notes
    if (Array.isArray(backup.notes)) {
      const insertNote = db.prepare(`
        INSERT OR REPLACE INTO notes (id, user_id, content, tags, created_at)
        VALUES (@id, @user_id, @content, @tags, @created_at)
      `);
      for (const note of backup.notes) insertNote.run(note);
    }

    // Restore reminders
    if (Array.isArray(backup.reminders)) {
      const insertRem = db.prepare(`
        INSERT OR REPLACE INTO reminders (id, user_id, content, remind_at, is_sent, created_at)
        VALUES (@id, @user_id, @content, @remind_at, @is_sent, @created_at)
      `);
      for (const rem of backup.reminders) insertRem.run(rem);
    }

    // Restore gamification
    if (Array.isArray(backup.gamification)) {
      const insertGamify = db.prepare(`
        INSERT OR REPLACE INTO user_gamification (user_id, points, level, streak_days, last_active_date, tasks_completed, updated_at)
        VALUES (@user_id, @points, @level, @streak_days, @last_active_date, @tasks_completed, @updated_at)
      `);
      for (const g of backup.gamification) insertGamify.run(g);
    }

    // Restore badges
    if (Array.isArray(backup.badges)) {
      const insertBadge = db.prepare(`
        INSERT OR IGNORE INTO user_badges (user_id, badge_key, badge_name, badge_icon, description, unlocked_at)
        VALUES (@user_id, @badge_key, @badge_name, @badge_icon, @description, @unlocked_at)
      `);
      for (const b of backup.badges) insertBadge.run(b);
    }
  });

  restoreTx();
  return {
    notesRestored: backup.notes ? backup.notes.length : 0,
    remindersRestored: backup.reminders ? backup.reminders.length : 0,
  };
}

/**
 * সর্বশেষ ব্যাকআপ ফাইলের পাথ পাওয়া (লোকাল, OneDrive অথবা Google Drive ফোল্ডার থেকে)
 */
function getLatestBackupPath() {
  const checkDirs = [
    BACKUP_DIR,
    getOneDriveBackupFolder(),
    getGoogleDriveLocalFolder(),
  ].filter(Boolean);

  for (const dir of checkDirs) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith('frend_backup_') && f.endsWith('.json'))
        .sort()
        .reverse();

      if (files.length > 0) {
        return path.join(dir, files[0]);
      }
    }
  }

  return null;
}

/**
 * WhatsApp-এর জন্য ব্যাকআপ রেসপন্স টেক্সট ফরম্যাট করা
 */
async function formatBackupResponse(userId) {
  const result = await createCloudBackup(userId);
  const localIp = getLocalIpAddress();

  const cloudItems = [];

  // ১. Google Drive স্ট্যাটাস
  if (result.driveUploaded) {
    cloudItems.push(`☁️ *Google Drive:* ✅ ক্লাউডে সংরক্ষিত (FREND_Backups)\n   🔗 ${result.driveFileLink || 'Drive-এ যুক্ত'}`);
  } else if (result.gDriveLocalSynced) {
    cloudItems.push(`☁️ *Google Drive:* ✅ ড্রাইভ ফোল্ডারে সংরক্ষিত (অটো-সিঙ্ক সক্রিয়)`);
  } else {
    cloudItems.push(`☁️ *Google Drive:* ⚙️ সরাসরি ক্লাউড অটো-আপলোডের জন্য: \`node setup-calendar.js\`-এ অনুমতি দাও`);
  }

  // ২. Microsoft OneDrive স্ট্যাটাস
  if (result.oneDriveSynced) {
    cloudItems.push(`📁 *Microsoft OneDrive:* ✅ ক্লাউডে সংরক্ষিত (FREND_Backups ফোল্ডার থেকে স্বয়ংক্রিয় সিঙ্ক হচ্ছে)`);
  } else {
    cloudItems.push(`📁 *Microsoft OneDrive:* 🌐 নিচের ওয়েব লিঙ্ক থেকে ১-ক্লিকে যেকোনো ক্লাউডে আপলোড করতে পারো`);
  }

  // ৩. ড্যাশবোর্ড ডাউনলোড লিঙ্ক
  const downloadUrl = `http://${localIp}:3000/api/backup/download`;

  return (
    `☁️ *ক্লাউড ব্যাকআপ সফল হয়েছে!*\n\n` +
    `📁 ফাইল: \`${result.fileName}\`\n` +
    `📝 সংরক্ষিত নোট: *${result.totalNotes}টি*\n` +
    `⏰ সংরক্ষিত রিমাইন্ডার: *${result.totalReminders}টি*\n` +
    `✅ সম্পন্ন কাজ: *${result.totalCompleted}টি*\n\n` +
    `*ক্লাউড স্টোরেজ স্ট্যাটাস:*\n` +
    cloudItems.join('\n\n') + '\n\n' +
    `💾 *১-ক্লিক ব্যাকআপ ডাউনলোড (ফোন/পিসি):*\n` +
    `🔗 ${downloadUrl}\n\n` +
    `🔄 *পুনরুদ্ধার করতে:* WhatsApp-এ লেখো *রিস্টোর*\n` +
    `💡 _প্রতিদিন রাত ১২:০০ টায় স্বয়ংক্রিয় ব্যাকআপ ক্লাউডে জমা হয়!_`
  );
}

module.exports = {
  createCloudBackup,
  restoreFromBackupFile,
  getLatestBackupPath,
  formatBackupResponse,
  generateFullBackupData,
  getOneDriveBackupFolder,
  getGoogleDriveLocalFolder,
  BACKUP_DIR,
};
