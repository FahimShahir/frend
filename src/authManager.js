/**
 * Multi-User Authentication, Access Control & Plan Management — FREND
 *
 * Implements:
 * 1. Multi-User Data Isolation & RBAC (Admin & User roles)
 * 2. Scrypt-based password hashing & verification
 * 3. Secure WhatsApp credential-change tokens & HTTPS verification portal
 * 4. User Enable / Disable state enforcement
 * 5. Plans and Entitlements system (Free, Pro, Enterprise)
 * 6. User Connection & Encrypted Google Calendar tokens
 * 7. Non-secret Audit Logging
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const security = require('./security');

const dbPath = path.join(__dirname, '..', 'data', 'frend.db');
const db = new Database(dbPath);

// ─── Table Migrations & Schema Setup ─────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_authorized_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    bound_phone TEXT DEFAULT NULL,
    status TEXT DEFAULT 'active', -- 'active' | 'disabled'
    role TEXT DEFAULT 'user',     -- 'admin' | 'user'
    assigned_plan_id TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    entitlements TEXT NOT NULL, -- JSON array of allowed features
    limits TEXT NOT NULL,       -- JSON object of usage quotas
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    provider_account_id TEXT DEFAULT '',
    connection_status TEXT DEFAULT 'connected',
    encrypted_tokens TEXT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS user_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    result TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    provider TEXT NOT NULL,
    redirect_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );

  CREATE TABLE IF NOT EXISTS credential_change_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL
  );
`);

// Dynamic column migrations for bot_authorized_users
try {
  const userCols = db.pragma('table_info(bot_authorized_users)').map(c => c.name);
  if (!userCols.includes('assigned_plan_id')) {
    db.exec("ALTER TABLE bot_authorized_users ADD COLUMN assigned_plan_id TEXT DEFAULT 'free'");
  }
  if (!userCols.includes('updated_at')) {
    db.exec("ALTER TABLE bot_authorized_users ADD COLUMN updated_at DATETIME DEFAULT NULL");
  }
} catch (err) {
  console.warn('[AuthManager] Migration notice:', err.message);
}

// ─── Seed Default Plans ───────────────────────────────────────
function seedDefaultPlans() {
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM plans').get().c;
  if (existingCount === 0) {
    const defaultPlans = [
      {
        id: 'free',
        name: 'ফ্রি প্ল্যান (Free)',
        status: 'active',
        entitlements: JSON.stringify(['notes', 'reminders', 'local_ai']),
        limits: JSON.stringify({
          max_notes: 50,
          max_reminders: 20,
          voice: false,
          vision: false,
          calendar: false,
        }),
      },
      {
        id: 'pro',
        name: 'প্রো প্ল্যান (Pro)',
        status: 'active',
        entitlements: JSON.stringify(['notes', 'reminders', 'calendar', 'voice', 'vision', 'local_ai', 'unlimited_notes']),
        limits: JSON.stringify({
          max_notes: 1000,
          max_reminders: 500,
          voice: true,
          vision: true,
          calendar: true,
        }),
      },
      {
        id: 'enterprise',
        name: 'এন্টারপ্রাইজ (Enterprise)',
        status: 'active',
        entitlements: JSON.stringify(['notes', 'reminders', 'calendar', 'voice', 'vision', 'local_ai', 'unlimited_notes', 'priority_support']),
        limits: JSON.stringify({
          max_notes: 10000,
          max_reminders: 5000,
          voice: true,
          vision: true,
          calendar: true,
        }),
      },
    ];

    const insertStmt = db.prepare(`
      INSERT INTO plans (id, name, status, entitlements, limits)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const p of defaultPlans) {
      insertStmt.run(p.id, p.name, p.status, p.entitlements, p.limits);
    }
    console.log('📦 ডিফল্ট প্ল্যানসমূহ (Free, Pro, Enterprise) সফলভাবে লোড হয়েছে।');
  }
}
seedDefaultPlans();

// ─── Password Migration for Existing Users ────────────────────
function migratePlaintextPasswords() {
  try {
    const users = db.prepare('SELECT id, password FROM bot_authorized_users').all();
    const updateStmt = db.prepare('UPDATE bot_authorized_users SET password = ? WHERE id = ?');
    for (const u of users) {
      if (!u.password.startsWith('scrypt:')) {
        const hashed = security.hashPassword(u.password);
        updateStmt.run(hashed, u.id);
      }
    }
  } catch (err) {
    console.warn('[AuthManager] Password hash migration notice:', err.message);
  }
}
migratePlaintextPasswords();

// Clean phone digits helper
function cleanDigits(jidOrPhone) {
  if (!jidOrPhone) return '';
  const s = String(jidOrPhone);
  return s.split('@')[0].split(':')[0].replace(/\D/g, '');
}

/**
 * Audit Logging Helper (Never stores secrets or passwords)
 */
function logAudit(actorUserId, targetUserId, action, result, metadata = {}) {
  try {
    const cleanMeta = { ...metadata };
    delete cleanMeta.password;
    delete cleanMeta.currentPassword;
    delete cleanMeta.newPassword;
    delete cleanMeta.token;
    delete cleanMeta.secret;

    db.prepare(`
      INSERT INTO user_audit_logs (actor_user_id, target_user_id, action, result, metadata)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      String(actorUserId || 'system'),
      String(targetUserId || 'system'),
      action,
      result,
      JSON.stringify(cleanMeta)
    );
  } catch (err) {
    console.error('[AuthManager] logAudit error:', err.message);
  }
}

/**
 * প্রাথমিক অ্যাডমিন অ্যাকাউন্ট তৈরি (যদি না থাকে)
 */
function ensureInitialAdminUser() {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM bot_authorized_users').get().c;
    if (count === 0) {
      const hashedPass = security.hashPassword('123');
      db.prepare(`
        INSERT INTO bot_authorized_users (username, password, display_name, role, status, assigned_plan_id)
        VALUES ('admin', ?, 'প্রধান অ্যাডমিন', 'admin', 'active', 'enterprise')
      `).run(hashedPass);
      console.log('👑 প্রাথমিক অ্যাডমিন ইউজার তৈরি হয়েছে: username=admin, password=123 (hashed)');
      logAudit('system', 'admin', 'initial_admin_created', 'SUCCESS', { username: 'admin' });
    }
  } catch (err) {
    console.error('[AuthManager] ensureInitialAdminUser error:', err.message);
  }
}
ensureInitialAdminUser();

// Rate limiter for WhatsApp login prompts
const recentPromptTimestamps = new Map();

function shouldSendAuthPrompt(phoneOrJid) {
  const key = cleanDigits(phoneOrJid);
  if (!key) return false;
  const last = recentPromptTimestamps.get(key) || 0;
  const now = Date.now();
  if (now - last > 10 * 60 * 1000) {
    recentPromptTimestamps.set(key, now);
    return true;
  }
  return false;
}

/**
 * এই নম্বরটি কি অনুমোদিত ও সক্রিয় আছে?
 * Section 7: Disabled users are strictly rejected!
 */
function getAuthenticatedUser(phoneOrJid) {
  const digits = cleanDigits(phoneOrJid);
  if (!digits) return null;

  try {
    const users = db.prepare(`
      SELECT * FROM bot_authorized_users
      WHERE bound_phone IS NOT NULL
    `).all();

    for (const u of users) {
      const boundDigits = cleanDigits(u.bound_phone);
      const isMatch = boundDigits === digits ||
        (digits.length >= 9 && boundDigits.length >= 9 && digits.slice(-9) === boundDigits.slice(-9));

      if (isMatch) {
        // Enforce account status: if disabled or blocked, block access!
        if (u.status === 'disabled' || u.status === 'blocked') {
          return null;
        }
        return u;
      }
    }
  } catch (err) {
    console.error('[AuthManager] getAuthenticatedUser error:', err.message);
  }
  return null;
}

/**
 * ইউজার আইডি দিয়ে ইউজার আনা
 */
function getUserById(id) {
  try {
    return db.prepare('SELECT * FROM bot_authorized_users WHERE id = ?').get(id);
  } catch (err) {
    return null;
  }
}

/**
 * ইউজারনেম দিয়ে ইউজার আনা
 */
function getUserByUsername(username) {
  try {
    return db.prepare('SELECT * FROM bot_authorized_users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  } catch (err) {
    return null;
  }
}

/**
 * লগইন প্রচেষ্টা পরীক্ষা করা (WhatsApp মেসেজ থেকে)
 */
function attemptLogin(phoneOrJid, text) {
  if (!text) return { isAttempt: false };
  const raw = text.trim();

  let parts = raw.split(/\s+/);
  if (parts.length >= 3 && /^login$/i.test(parts[0])) {
    parts = parts.slice(1);
  }

  if (parts.length !== 2) {
    return { isAttempt: false };
  }

  const [inputUsername, inputPassword] = parts;

  try {
    const user = getUserByUsername(inputUsername);
    if (!user) {
      logAudit(phoneOrJid, inputUsername, 'login_attempt', 'FAILED', { reason: 'User not found' });
      return { isAttempt: true, success: false, reason: 'ইউজারনেম খুঁজে পাওয়া যায়নি' };
    }

    if (user.status === 'disabled' || user.status === 'blocked') {
      logAudit(phoneOrJid, user.id, 'login_attempt', 'BLOCKED', { reason: 'Account disabled' });
      return { isAttempt: true, success: false, reason: 'এই অ্যাকাউন্টটি নিষ্ক্রিয় বা অ্যাডমিন কর্তৃক বন্ধ করা আছে' };
    }

    const isValid = security.verifyPassword(inputPassword, user.password);
    if (!isValid) {
      logAudit(phoneOrJid, user.id, 'login_attempt', 'FAILED', { reason: 'Invalid password' });
      return { isAttempt: true, success: false, reason: 'পাসওয়ার্ড সঠিক নয়' };
    }

    // সফল লগইন — ফোন নম্বর বাইন্ড করো
    const targetJid = String(phoneOrJid).includes('@') ? String(phoneOrJid) : `${cleanDigits(phoneOrJid)}@c.us`;
    db.prepare(`
      UPDATE bot_authorized_users
      SET bound_phone = ?, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetJid, user.id);

    recentPromptTimestamps.delete(cleanDigits(phoneOrJid));
    logAudit(user.id, user.id, 'login_success', 'SUCCESS', { boundPhone: targetJid });

    return {
      isAttempt: true,
      success: true,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        status: user.status,
        assigned_plan_id: user.assigned_plan_id,
        bound_phone: targetJid,
      },
    };
  } catch (err) {
    console.error('[AuthManager] attemptLogin error:', err.message);
    return { isAttempt: true, success: false, reason: err.message };
  }
}

/**
 * সমস্ত ইউজার লিস্ট
 */
function getAllUsers() {
  try {
    return db.prepare(`
      SELECT u.id, u.username, u.display_name, u.bound_phone, u.status, u.role, u.assigned_plan_id,
             u.created_at, u.updated_at, u.last_login_at,
             p.name as plan_name
      FROM bot_authorized_users u
      LEFT JOIN plans p ON u.assigned_plan_id = p.id
      ORDER BY u.id ASC
    `).all();
  } catch (err) {
    console.error('[AuthManager] getAllUsers error:', err.message);
    return [];
  }
}

/**
 * নতুন ইউজার তৈরি (অ্যাডমিন বা সিস্টেম থেকে)
 */
function createUser(username, password, displayName = '', boundPhone = null, role = 'user', planId = 'free', actorId = 'admin') {
  if (!username || !password) {
    throw new Error('ইউজারনেম এবং পাসওয়ার্ড পূরণ করা আবশ্যক');
  }
  const cleanUser = username.trim().toLowerCase();
  const existing = getUserByUsername(cleanUser);
  if (existing) {
    throw new Error('এই ইউজারনেমটি ইতিমধ্যে বিদ্যমান');
  }

  const policy = security.validatePasswordPolicy(password);
  if (!policy.valid) {
    throw new Error(policy.message);
  }

  const hashedPassword = security.hashPassword(password.trim());
  let formattedPhone = boundPhone ? boundPhone.trim() : null;
  if (formattedPhone && !formattedPhone.includes('@')) {
    formattedPhone = `${cleanDigits(formattedPhone)}@c.us`;
  }

  const targetPlan = planId || 'free';

  const res = db.prepare(`
    INSERT INTO bot_authorized_users (username, password, display_name, bound_phone, role, status, assigned_plan_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(cleanUser, hashedPassword, displayName.trim() || cleanUser, formattedPhone, role, targetPlan);

  const newId = res.lastInsertRowid;
  logAudit(actorId, newId, 'user_created', 'SUCCESS', { username: cleanUser, role, planId: targetPlan });
  return newId;
}

/**
 * ইউজার আপডেট (নাম, রোল, ইত্যাদি)
 */
function updateUser(id, patch, actorId = 'admin') {
  const user = getUserById(id);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');

  let newPass = user.password;
  if (patch.password && patch.password.trim()) {
    const policy = security.validatePasswordPolicy(patch.password);
    if (!policy.valid) throw new Error(policy.message);
    newPass = security.hashPassword(patch.password.trim());
  }

  const newName = patch.displayName !== undefined ? patch.displayName.trim() : user.display_name;
  const newStatus = patch.status !== undefined ? patch.status : user.status;
  const newRole = patch.role !== undefined ? patch.role : user.role;
  const newPlan = patch.assigned_plan_id !== undefined ? patch.assigned_plan_id : user.assigned_plan_id;

  db.prepare(`
    UPDATE bot_authorized_users
    SET password = ?, display_name = ?, status = ?, role = ?, assigned_plan_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(newPass, newName, newStatus, newRole, newPlan, id);

  logAudit(actorId, id, 'user_updated', 'SUCCESS', { newName, newStatus, newRole, newPlan });
  return true;
}

/**
 * ইউজার ডিলিট করা
 */
function deleteUser(id, actorId = 'admin') {
  const user = getUserById(id);
  if (!user) return false;

  // Cleanup isolated user data (cascade deletion)
  db.prepare('DELETE FROM notes WHERE user_id = ? OR user_id = ?').run(String(id), String(user.bound_phone || ''));
  db.prepare('DELETE FROM reminders WHERE user_id = ? OR user_id = ?').run(String(id), String(user.bound_phone || ''));
  db.prepare('DELETE FROM memories WHERE user_id = ? OR user_id = ?').run(String(id), String(user.bound_phone || ''));
  db.prepare('DELETE FROM user_connections WHERE user_id = ?').run(id);

  const res = db.prepare('DELETE FROM bot_authorized_users WHERE id = ?').run(id);
  logAudit(actorId, id, 'user_deleted', 'SUCCESS', { username: user.username });
  return res.changes > 0;
}

/**
 * ইউজার অ্যাকাউন্ট Disable বা Enable করা (Section 7)
 */
function setUserAccountStatus(id, status, actorId = 'admin', reason = '') {
  if (status !== 'active' && status !== 'disabled') {
    throw new Error('স্ট্যাটাস অবশ্যই "active" বা "disabled" হতে হবে');
  }

  const user = getUserById(id);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');

  db.prepare(`
    UPDATE bot_authorized_users
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, id);

  // If disabled, revoke active WhatsApp session immediately
  if (status === 'disabled') {
    db.prepare('UPDATE bot_authorized_users SET bound_phone = NULL WHERE id = ?').run(id);
  }

  logAudit(actorId, id, status === 'disabled' ? 'user_disabled' : 'user_enabled', 'SUCCESS', { reason });
  return true;
}

/**
 * WhatsApp বাইন্ডিং ডিসকানেক্ট / আনবাইন্ড করা
 */
function unbindUserPhone(id, actorId = null) {
  const user = getUserById(id);
  const res = db.prepare('UPDATE bot_authorized_users SET bound_phone = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  logAudit(actorId || id, id, 'phone_unbound', 'SUCCESS', { username: user ? user.username : '' });
  return res.changes > 0;
}

// ─── Plans & Entitlements Management (Section 8) ──────────────
function getAllPlans() {
  try {
    const plans = db.prepare('SELECT * FROM plans ORDER BY id ASC').all();
    return plans.map(p => ({
      ...p,
      entitlements: JSON.parse(p.entitlements || '[]'),
      limits: JSON.parse(p.limits || '{}'),
    }));
  } catch (err) {
    return [];
  }
}

function getPlanById(planId) {
  try {
    const p = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId);
    if (!p) return null;
    return {
      ...p,
      entitlements: JSON.parse(p.entitlements || '[]'),
      limits: JSON.parse(p.limits || '{}'),
    };
  } catch (err) {
    return null;
  }
}

function assignPlanToUser(userId, planId, actorId = 'admin') {
  const plan = getPlanById(planId);
  if (!plan) throw new Error('প্ল্যান খুঁজে পাওয়া যায়নি');

  const user = getUserById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');

  db.prepare(`
    UPDATE bot_authorized_users
    SET assigned_plan_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(planId, userId);

  logAudit(actorId, userId, 'plan_assigned', 'SUCCESS', { planId });
  return true;
}

/**
 * Check if a user can access a specific feature based on status & plan
 */
function canUserAccessFeature(userId, featureName) {
  const user = getUserById(userId);
  if (!user) return { allowed: false, reason: 'ইউজার রেজিস্টার্ড নয়।' };

  if (user.status === 'disabled' || user.status === 'blocked') {
    return { allowed: false, reason: 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় করা আছে।' };
  }

  // Admin has access to all features
  if (user.role === 'admin') {
    return { allowed: true };
  }

  const plan = getPlanById(user.assigned_plan_id || 'free');
  if (!plan) return { allowed: false, reason: 'প্ল্যান সনাক্ত করা যায়নি।' };

  if (!plan.entitlements.includes(featureName)) {
    return {
      allowed: false,
      reason: `আপনার বর্তমান প্ল্যানে (${plan.name}) "${featureName}" ফিচারটি অন্তর্ভুক্ত নেই। আপগ্রেড করতে অ্যাডমিনের সাথে যোগাযোগ করুন।`,
    };
  }

  return { allowed: true, plan };
}

// ─── WhatsApp Secure Credential Change Flow (Section 3) ───────
/**
 * Creates single-use 10-minute token for password/username change
 */
function createCredentialChangeToken(userId, type = 'credentials_change') {
  const user = getUserById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');
  if (user.status !== 'active') throw new Error('নিষ্ক্রিয় অ্যাকাউন্টে ক্রিডেনশিয়াল পরিবর্তন সম্ভব নয়');

  const token = security.generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

  db.prepare(`
    INSERT INTO credential_change_tokens (token, user_id, type, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, type, expiresAt);

  return token;
}

function verifyCredentialChangeToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT * FROM credential_change_tokens
    WHERE token = ? AND expires_at > datetime('now')
  `).get(token);

  if (!row) return null;
  const user = getUserById(row.user_id);
  if (!user || user.status !== 'active') return null;

  return { token: row.token, user, type: row.type };
}

function invalidateCredentialChangeToken(token) {
  db.prepare('DELETE FROM credential_change_tokens WHERE token = ?').run(token);
}

/**
 * Username change with authentication
 */
function changeUsername(userId, currentUsername, currentPassword, newUsername, token = null) {
  const user = getUserById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');

  if (user.status !== 'active') {
    throw new Error('অ্যাকাউন্টটি সক্রিয় নয়');
  }

  // Verify current credentials
  if (user.username.toLowerCase() !== currentUsername.trim().toLowerCase()) {
    logAudit(userId, userId, 'username_change_attempt', 'FAILED', { reason: 'Incorrect current username' });
    throw new Error('বর্তমান ইউজারনেম সঠিক নয়');
  }

  const isPassValid = security.verifyPassword(currentPassword, user.password);
  if (!isPassValid) {
    logAudit(userId, userId, 'username_change_attempt', 'FAILED', { reason: 'Incorrect current password' });
    throw new Error('বর্তমান পাসওয়ার্ড সঠিক নয়');
  }

  const cleanNewUser = newUsername.trim().toLowerCase();
  if (cleanNewUser.length < 3) {
    throw new Error('নতুন ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে');
  }

  const existing = getUserByUsername(cleanNewUser);
  if (existing && existing.id !== user.id) {
    throw new Error('এই ইউজারনেমটি ইতিমধ্যে অন্য কারো দখলে আছে');
  }

  db.prepare(`
    UPDATE bot_authorized_users
    SET username = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(cleanNewUser, userId);

  if (token) invalidateCredentialChangeToken(token);
  logAudit(userId, userId, 'username_changed', 'SUCCESS', { oldUsername: user.username, newUsername: cleanNewUser });
  return true;
}

/**
 * Password change with authentication
 */
function changePassword(userId, currentUsername, currentPassword, newPassword, token = null) {
  const user = getUserById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি');

  if (user.status !== 'active') {
    throw new Error('অ্যাকাউন্টটি সক্রিয় নয়');
  }

  // Verify current credentials
  if (user.username.toLowerCase() !== currentUsername.trim().toLowerCase()) {
    logAudit(userId, userId, 'password_change_attempt', 'FAILED', { reason: 'Incorrect current username' });
    throw new Error('বর্তমান ইউজারনেম সঠিক নয়');
  }

  const isPassValid = security.verifyPassword(currentPassword, user.password);
  if (!isPassValid) {
    logAudit(userId, userId, 'password_change_attempt', 'FAILED', { reason: 'Incorrect current password' });
    throw new Error('বর্তমান পাসওয়ার্ড সঠিক নয়');
  }

  const policy = security.validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.message);
  }

  const hashedNewPass = security.hashPassword(newPassword.trim());

  db.prepare(`
    UPDATE bot_authorized_users
    SET password = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(hashedNewPass, userId);

  if (token) invalidateCredentialChangeToken(token);
  logAudit(userId, userId, 'password_changed', 'SUCCESS');
  return true;
}

/**
 * অ্যাডমিন বা কন্ট্রোল প্যানেল দ্বারা যেকোনো ইউজারের পাসওয়ার্ড সরাসরি আপডেট করা
 */
function adminSetUserPassword(userId, newPassword, actorId = 'admin') {
  const user = getUserById(userId);
  if (!user) throw new Error('ইউজার পাওয়া যায়নি (ID: ' + userId + ')');

  const policy = security.validatePasswordPolicy(newPassword);
  if (!policy.valid) {
    throw new Error(policy.message);
  }

  const hashedPassword = security.hashPassword(newPassword.trim());
  db.prepare(`
    UPDATE bot_authorized_users 
    SET password = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(hashedPassword, userId);

  logAudit(actorId, userId, 'password_admin_reset', 'SUCCESS', { 
    username: user.username,
    targetUserId: userId,
  });

  return { success: true, username: user.username };
}

// ─── Multi-User Google Calendar Connection Storage ────────────
function saveUserCalendarConnection(userId, email, tokens) {
  const enc = security.encryptData(tokens);
  db.prepare(`
    INSERT INTO user_connections (user_id, provider, provider_account_id, connection_status, encrypted_tokens, iv, auth_tag, updated_at)
    VALUES (?, 'google_calendar', ?, 'connected', ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      provider_account_id = excluded.provider_account_id,
      connection_status = 'connected',
      encrypted_tokens = excluded.encrypted_tokens,
      iv = excluded.iv,
      auth_tag = excluded.auth_tag,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, email || '', enc.cipherText, enc.iv, enc.authTag);

  logAudit(userId, userId, 'calendar_connected', 'SUCCESS', { email: email || 'Google Account' });
  return true;
}

function getUserCalendarConnection(userId) {
  try {
    const row = db.prepare(`
      SELECT * FROM user_connections
      WHERE user_id = ? AND provider = 'google_calendar' AND connection_status = 'connected'
    `).get(userId);

    if (!row) return null;
    const tokens = security.decryptData({
      cipherText: row.encrypted_tokens,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    return {
      userId: row.user_id,
      provider: row.provider,
      providerAccountId: row.provider_account_id,
      tokens,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    console.error(`[AuthManager] getUserCalendarConnection error for user ${userId}:`, err.message);
    return null;
  }
}

function deleteUserCalendarConnection(userId) {
  const res = db.prepare(`
    DELETE FROM user_connections
    WHERE user_id = ? AND provider = 'google_calendar'
  `).run(userId);
  logAudit(userId, userId, 'calendar_disconnected', 'SUCCESS');
  return res.changes > 0;
}

// ─── OAuth State Store (Single Use, Replay Resistant) ─────────
function saveOAuthState(state, userId, provider = 'google_calendar') {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
  db.prepare(`
    INSERT INTO oauth_states (state, user_id, provider, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(state, userId, provider, expiresAt);
}

function verifyAndConsumeOAuthState(state) {
  if (!state) return null;
  const row = db.prepare(`
    SELECT * FROM oauth_states
    WHERE state = ? AND expires_at > datetime('now')
  `).get(state);

  if (!row) return null;
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state); // Single-use consumption
  return row;
}

// ─── Audit Logs Query ─────────────────────────────────────────
function getAuditLogs(limit = 100) {
  try {
    return db.prepare(`
      SELECT * FROM user_audit_logs
      ORDER BY id DESC
      LIMIT ?
    `).all(limit);
  } catch (err) {
    return [];
  }
}

module.exports = {
  cleanDigits,
  getAuthenticatedUser,
  getUserById,
  getUserByUsername,
  attemptLogin,
  shouldSendAuthPrompt,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  setUserAccountStatus,
  unbindUserPhone,
  ensureInitialAdminUser,
  // Plans & Entitlements
  getAllPlans,
  getPlanById,
  assignPlanToUser,
  canUserAccessFeature,
  // WhatsApp Credential Flow
  createCredentialChangeToken,
  verifyCredentialChangeToken,
  invalidateCredentialChangeToken,
  changeUsername,
  changePassword,
  adminSetUserPassword,
  // Calendar Connections
  saveUserCalendarConnection,
  getUserCalendarConnection,
  deleteUserCalendarConnection,
  // OAuth State
  saveOAuthState,
  verifyAndConsumeOAuthState,
  // Audits
  logAudit,
  getAuditLogs,
};
