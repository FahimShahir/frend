const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'frend.db'));

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    remind_at DATETIME NOT NULL,
    scheduled_at DATETIME,
    timezone TEXT DEFAULT 'Asia/Dhaka',
    status TEXT DEFAULT 'PENDING',
    job_started_at DATETIME,
    notification_attempted_at DATETIME,
    notification_confirmed_at DATETIME,
    delivery_channel TEXT,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    is_sent INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    note_count INTEGER DEFAULT 0,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS action_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    target_id TEXT,
    description TEXT,
    before_state TEXT,
    after_state TEXT,
    status TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    original_ref TEXT,
    title TEXT,
    content TEXT NOT NULL,
    structured_data TEXT,
    topics TEXT DEFAULT '',
    event_date DATETIME,
    confidence REAL DEFAULT 1.0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_diagnostic_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_id TEXT UNIQUE NOT NULL,
    user_id TEXT,
    category TEXT NOT NULL,
    original_intent TEXT,
    user_message TEXT,
    root_cause TEXT,
    corrective_action TEXT,
    test_results TEXT,
    status TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_evolution_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    change_id TEXT UNIQUE NOT NULL,
    version_from TEXT NOT NULL,
    version_to TEXT NOT NULL,
    reason TEXT NOT NULL,
    risk_level TEXT NOT NULL,
    files_changed TEXT,
    tests_executed TEXT,
    test_results TEXT,
    status TEXT NOT NULL,
    health_check_status TEXT,
    rollback_occurred INTEGER DEFAULT 0,
    backup_path TEXT,
    lessons_learned TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deployed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS system_feature_flags (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    risk_level TEXT DEFAULT 'LOW_RISK',
    metadata TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS system_pending_proposals (
    proposal_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    risk_level TEXT NOT NULL,
    patch_diff TEXT,
    approval_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'PENDING',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME
  );
`);

// Migration: Ensure reminders table has all required lifecycle columns
try {
  const existingCols = db.pragma('table_info(reminders)').map(c => c.name);
  if (!existingCols.includes('scheduled_at')) db.exec('ALTER TABLE reminders ADD COLUMN scheduled_at DATETIME');
  if (!existingCols.includes('timezone')) db.exec("ALTER TABLE reminders ADD COLUMN timezone TEXT DEFAULT 'Asia/Dhaka'");
  if (!existingCols.includes('status')) db.exec("ALTER TABLE reminders ADD COLUMN status TEXT DEFAULT 'PENDING'");
  if (!existingCols.includes('job_started_at')) db.exec('ALTER TABLE reminders ADD COLUMN job_started_at DATETIME');
  if (!existingCols.includes('notification_attempted_at')) db.exec('ALTER TABLE reminders ADD COLUMN notification_attempted_at DATETIME');
  if (!existingCols.includes('notification_confirmed_at')) db.exec('ALTER TABLE reminders ADD COLUMN notification_confirmed_at DATETIME');
  if (!existingCols.includes('delivery_channel')) db.exec('ALTER TABLE reminders ADD COLUMN delivery_channel TEXT');
  if (!existingCols.includes('retry_count')) db.exec('ALTER TABLE reminders ADD COLUMN retry_count INTEGER DEFAULT 0');
  if (!existingCols.includes('last_error')) db.exec('ALTER TABLE reminders ADD COLUMN last_error TEXT');
  if (!existingCols.includes('google_event_id')) db.exec('ALTER TABLE reminders ADD COLUMN google_event_id TEXT');
} catch (e) {
  console.warn('⚠️ Reminders table migration notice:', e.message);
}

// ─── Notes ───────────────────────────────────────────────────
function saveNote(userId, content, tags = '') {
  const stmt = db.prepare(
    'INSERT INTO notes (user_id, content, tags) VALUES (?, ?, ?)'
  );
  const result = stmt.run(userId, content, tags);

  // Update user note count
  db.prepare(`
    INSERT INTO users (id, note_count) VALUES (?, 1)
    ON CONFLICT(id) DO UPDATE SET note_count = note_count + 1
  `).run(userId);

  // Synchronize Layer B (Persistent Memory) with Layer C (Application Notes)
  try {
    saveMemory(userId, {
      memoryType: 'fact',
      sourceType: 'text',
      title: tags || 'নোট',
      content,
      topics: tags || 'নোট',
    });
  } catch (_) {}

  return result.lastInsertRowid;
}

function getNotes(userId, limit = 50) {
  return db.prepare(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY id ASC LIMIT ?'
  ).all(userId, limit);
}

function searchNotes(userId, keyword) {
  return db.prepare(
    "SELECT * FROM notes WHERE user_id = ? AND (content LIKE ? OR tags LIKE ?) ORDER BY created_at DESC LIMIT 15"
  ).all(userId, `%${keyword}%`, `%${keyword}%`);
}

function deleteNote(userId, noteId) {
  const result = db.prepare(
    'DELETE FROM notes WHERE id = ? AND user_id = ?'
  ).run(noteId, userId);
  return result.changes > 0;
}

function deleteAllNotes(userId) {
  const result = db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
  return result.changes;
}

function getNoteById(userId, noteId) {
  return db.prepare(
    'SELECT * FROM notes WHERE id = ? AND user_id = ?'
  ).get(noteId, userId);
}

function getRecentNotes(userId, limit = 5) {
  return db.prepare(
    'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

// ─── Reminders ───────────────────────────────────────────────
function saveReminder(userId, content, remindAt, options = {}) {
  const iso = (remindAt instanceof Date) ? remindAt.toISOString() : new Date(remindAt).toISOString();
  const scheduledAt = options.scheduledAt || iso;
  const timezone = options.timezone || 'Asia/Dhaka';
  const googleEventId = (typeof options === 'string' ? options : (options.googleEventId || null));
  const status = 'PENDING';
  const stmt = db.prepare(`
    INSERT INTO reminders (
      user_id, content, remind_at, scheduled_at, timezone, status, google_event_id, is_sent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `);
  return stmt.run(userId, content, iso, scheduledAt, timezone, status, googleEventId).lastInsertRowid;
}

function updateReminderGoogleEventId(id, googleEventId) {
  const stmt = db.prepare('UPDATE reminders SET google_event_id = ? WHERE id = ?');
  return stmt.run(googleEventId, id).changes > 0;
}

function getPendingReminders(nowIso = null) {
  const currentIso = nowIso || new Date().toISOString();
  return db.prepare(`
    SELECT * FROM reminders 
    WHERE is_sent = 0 
      AND (status IS NULL OR status IN ('PENDING', 'FAILED', 'RETRYING'))
      AND (retry_count IS NULL OR retry_count < 5)
      AND (
        remind_at <= ? 
        OR datetime(remind_at) <= datetime('now')
      )
    ORDER BY remind_at ASC
  `).all(currentIso);
}

function claimReminder(id, leaseTimeoutMs = 60000) {
  const now = new Date();
  const nowIso = now.toISOString();
  const leaseCutoffIso = new Date(now.getTime() - leaseTimeoutMs).toISOString();
  const stmt = db.prepare(`
    UPDATE reminders 
    SET status = 'PROCESSING',
        job_started_at = ?
    WHERE id = ? 
      AND is_sent = 0
      AND (
        status IS NULL
        OR status IN ('PENDING', 'FAILED', 'RETRYING')
        OR (status = 'PROCESSING' AND job_started_at < ?)
      )
  `);
  const result = stmt.run(nowIso, id, leaseCutoffIso);
  return result.changes > 0;
}

function markReminderDelivered(id, channel = 'whatsapp', confirmedAt = null) {
  const iso = confirmedAt || new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE reminders 
    SET is_sent = 1,
        status = 'DELIVERED',
        delivery_channel = ?,
        notification_confirmed_at = ?
    WHERE id = ?
  `);
  return stmt.run(channel, iso, id).changes > 0;
}

function recordReminderDeliveryAttempt(id, error = null, retryCount = 1) {
  const nowIso = new Date().toISOString();
  const status = retryCount >= 5 ? 'FAILED' : 'RETRYING';
  const stmt = db.prepare(`
    UPDATE reminders 
    SET notification_attempted_at = ?,
        status = ?,
        retry_count = ?,
        last_error = ?
    WHERE id = ?
  `);
  return stmt.run(nowIso, status, retryCount, error ? String(error) : null, id).changes > 0;
}

function recoverPendingReminders(maxOverdueMs = 24 * 60 * 60 * 1000) {
  const now = new Date();
  const cutoffIso = new Date(now.getTime() - maxOverdueMs).toISOString();

  // Reset interrupted PROCESSING jobs back to PENDING
  const stuckReset = db.prepare(`
    UPDATE reminders 
    SET status = 'PENDING'
    WHERE is_sent = 0 AND status = 'PROCESSING'
  `).run();

  // Mark excessively overdue reminders as OVERDUE
  const overdueMark = db.prepare(`
    UPDATE reminders 
    SET status = 'OVERDUE'
    WHERE is_sent = 0 
      AND status IN ('PENDING', 'FAILED', 'RETRYING') 
      AND remind_at < ?
  `).run(cutoffIso);

  return {
    stuckReset: stuckReset.changes,
    overdueMarked: overdueMark.changes,
  };
}

function updateReminderStatus(id, status, error = null) {
  return db.prepare('UPDATE reminders SET status = ?, last_error = ? WHERE id = ?').run(status, error ? String(error) : null, id).changes > 0;
}

function getReminderDiagnostic(id) {
  return db.prepare('SELECT * FROM reminders WHERE id = ?').get(id);
}

function markReminderSent(id) {
  return markReminderDelivered(id, 'whatsapp');
}

function getActiveReminders(userId) {
  const nowIso = new Date().toISOString();
  return db.prepare(`
    SELECT * FROM reminders 
    WHERE user_id = ? 
      AND is_sent = 0 
      AND (status IS NULL OR status IN ('PENDING', 'PROCESSING', 'RETRYING'))
      AND (
        remind_at > ? 
        OR datetime(remind_at) > datetime('now')
      )
    ORDER BY remind_at ASC 
    LIMIT 15
  `).all(userId, nowIso);
}

function deleteReminder(userId, reminderId) {
  const result = db.prepare(
    'DELETE FROM reminders WHERE id = ? AND user_id = ? AND is_sent = 0'
  ).run(reminderId, userId);
  return result.changes > 0;
}

function deleteAllReminders(userId) {
  const result = db.prepare(
    'DELETE FROM reminders WHERE user_id = ? AND is_sent = 0'
  ).run(userId);
  return result.changes;
}

function updateNote(userId, noteId, newContent, newTags = '') {
  const stmt = db.prepare(
    'UPDATE notes SET content = ?, tags = COALESCE(?, tags) WHERE id = ? AND user_id = ?'
  );
  const result = stmt.run(newContent, newTags || null, noteId, userId);
  return result.changes > 0;
}

function restoreNoteWithId(userId, noteId, content, tags = '', createdAt = null) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO notes (id, user_id, content, tags, created_at) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))'
  );
  stmt.run(noteId, userId, content, tags, createdAt);
  return noteId;
}

function getReminderById(userId, reminderId) {
  return db.prepare(
    'SELECT * FROM reminders WHERE id = ? AND user_id = ?'
  ).get(reminderId, userId);
}

function updateReminder(userId, reminderId, newContent, newRemindAt = null) {
  let stmt;
  let result;
  if (newRemindAt) {
    const iso = (newRemindAt instanceof Date) ? newRemindAt.toISOString() : new Date(newRemindAt).toISOString();
    stmt = db.prepare('UPDATE reminders SET content = ?, remind_at = ? WHERE id = ? AND user_id = ?');
    result = stmt.run(newContent, iso, reminderId, userId);
  } else {
    stmt = db.prepare('UPDATE reminders SET content = ? WHERE id = ? AND user_id = ?');
    result = stmt.run(newContent, reminderId, userId);
  }
  return result.changes > 0;
}

function restoreReminderWithId(userId, reminderId, content, remindAt, isSent = 0, createdAt = null) {
  const iso = (remindAt instanceof Date) ? remindAt.toISOString() : new Date(remindAt).toISOString();
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO reminders (id, user_id, content, remind_at, is_sent, created_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))'
  );
  stmt.run(reminderId, userId, content, iso, isSent, createdAt);
  return reminderId;
}

// ─── Action History (Universal State & Undo Engine) ───────────
function recordAction(userId, operationId, intent, resourceType, targetId, description, beforeState = null, afterState = null, status = 'SUCCESS') {
  const stmt = db.prepare(`
    INSERT INTO action_history (operation_id, user_id, intent, resource_type, target_id, description, before_state, after_state, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    operationId,
    userId,
    intent,
    resourceType,
    targetId ? String(targetId) : null,
    description || '',
    beforeState ? JSON.stringify(beforeState) : null,
    afterState ? JSON.stringify(afterState) : null,
    status
  );
}

function getLastAction(userId) {
  const row = db.prepare(`
    SELECT * FROM action_history 
    WHERE user_id = ? AND status = 'SUCCESS' 
    ORDER BY created_at DESC, id DESC 
    LIMIT 1
  `).get(userId);
  if (!row) return null;
  return {
    ...row,
    before_state: row.before_state ? JSON.parse(row.before_state) : null,
    after_state: row.after_state ? JSON.parse(row.after_state) : null,
  };
}

function markActionUndone(operationId) {
  const result = db.prepare("UPDATE action_history SET status = 'UNDONE' WHERE operation_id = ?").run(operationId);
  return result.changes > 0;
}

function getActionHistory(userId, limit = 10) {
  const rows = db.prepare(`
    SELECT * FROM action_history 
    WHERE user_id = ? 
    ORDER BY created_at DESC, id DESC 
    LIMIT ?
  `).all(userId, limit);
  return rows.map(r => ({
    ...r,
    before_state: r.before_state ? JSON.parse(r.before_state) : null,
    after_state: r.after_state ? JSON.parse(r.after_state) : null,
  }));
}

// ─── Users ───────────────────────────────────────────────────
function getOrCreateUser(userId, name = '') {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    db.prepare(
      'INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)'
    ).run(userId, name);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }
  return user;
}

function getUserStats(userId) {
  const notes = db.prepare('SELECT COUNT(*) as count FROM notes WHERE user_id = ?').get(userId);
  const reminders = db.prepare(
    "SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND is_sent = 0 AND remind_at > datetime('now')"
  ).get(userId);
  return {
    totalNotes: notes.count,
    activeReminders: reminders.count,
  };
}

// ─── Intelligent Persistent Memory (Section 5, 6, 7) ──────────
function saveMemory(userId, memoryData) {
  const stmt = db.prepare(`
    INSERT INTO memories (
      user_id, memory_type, source_type, original_ref, title, content, structured_data, topics, event_date, confidence, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  const structuredJson = memoryData.structuredData ? (
    typeof memoryData.structuredData === 'string' ? memoryData.structuredData : JSON.stringify(memoryData.structuredData)
  ) : null;
  const result = stmt.run(
    userId,
    memoryData.memoryType || 'general',
    memoryData.sourceType || 'text',
    memoryData.originalRef || null,
    memoryData.title || '',
    memoryData.content || '',
    structuredJson,
    memoryData.topics || '',
    memoryData.eventDate || null,
    memoryData.confidence || 1.0
  );
  return result.lastInsertRowid;
}

function getMemories(userId, memoryType = null, limit = 20) {
  let rows;
  if (memoryType) {
    rows = db.prepare(`
      SELECT * FROM memories WHERE user_id = ? AND memory_type = ? AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(userId, memoryType, limit);
  } else {
    rows = db.prepare(`
      SELECT * FROM memories WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT ?
    `).all(userId, limit);
  }
  return rows.map(r => ({
    ...r,
    structured_data: r.structured_data ? JSON.parse(r.structured_data) : null,
  }));
}

function getRecentMemory(userId, memoryType = null) {
  let row;
  if (memoryType) {
    row = db.prepare(`
      SELECT * FROM memories WHERE user_id = ? AND memory_type = ? AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(userId, memoryType);
  } else {
    row = db.prepare(`
      SELECT * FROM memories WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC, id DESC LIMIT 1
    `).get(userId);
  }
  if (!row) return null;
  return {
    ...row,
    structured_data: row.structured_data ? JSON.parse(row.structured_data) : null,
  };
}

function searchMemories(userId, query, limit = 10) {
  const rows = db.prepare(`
    SELECT * FROM memories 
    WHERE user_id = ? AND is_active = 1 
      AND (content LIKE ? OR title LIKE ? OR topics LIKE ?)
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(userId, `%${query}%`, `%${query}%`, `%${query}%`, limit);
  return rows.map(r => ({
    ...r,
    structured_data: r.structured_data ? JSON.parse(r.structured_data) : null,
  }));
}

function forgetMemory(userId, targetRef) {
  let result;
  if (/^\d+$/.test(String(targetRef).trim())) {
    result = db.prepare('UPDATE memories SET is_active = 0 WHERE id = ? AND user_id = ?').run(Number(targetRef), userId);
  } else {
    result = db.prepare(`
      UPDATE memories SET is_active = 0 
      WHERE user_id = ? AND (content LIKE ? OR title LIKE ? OR topics LIKE ?)
    `).run(userId, `%${targetRef}%`, `%${targetRef}%`, `%${targetRef}%`);
  }
  return result.changes > 0;
}

function deleteMemory(userId, memoryId) {
  const result = db.prepare('DELETE FROM memories WHERE id = ? AND user_id = ?').run(memoryId, userId);
  return result.changes > 0;
}

function getAllUsers() {
  return db.prepare('SELECT * FROM users ORDER BY joined_at ASC').all();
}

// ─── System Diagnostic & Self-Healing Logs ─────────────────────
function logDiagnosticEvent({
  errorId = null,
  userId = null,
  category = 'GENERAL',
  originalIntent = null,
  userMessage = null,
  rootCause = null,
  correctiveAction = null,
  testResults = null,
  status = 'INFO',
  metadata = {}
}) {
  const errId = errorId || ('ERR_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const metaStr = typeof metadata === 'object' ? JSON.stringify(metadata) : String(metadata || '{}');
  const stmt = db.prepare(`
    INSERT INTO system_diagnostic_logs (
      error_id, user_id, category, original_intent, user_message, root_cause, corrective_action, test_results, status, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(errId, userId, category, originalIntent, userMessage, rootCause, correctiveAction, testResults, status, metaStr);
  return errId;
}

function getDiagnosticLogs(limit = 50) {
  return db.prepare('SELECT * FROM system_diagnostic_logs ORDER BY created_at DESC LIMIT ?').all(limit);
}

function getDiagnosticStats() {
  const total = db.prepare('SELECT COUNT(*) as count FROM system_diagnostic_logs').get().count;
  const healed = db.prepare("SELECT COUNT(*) as count FROM system_diagnostic_logs WHERE status IN ('HEALED', 'RECOVERED')").get().count;
  const missingData = db.prepare("SELECT COUNT(*) as count FROM system_diagnostic_logs WHERE status = 'MISSING_DATA'").get().count;
  const requiresHuman = db.prepare("SELECT COUNT(*) as count FROM system_diagnostic_logs WHERE status = 'REQUIRES_HUMAN'").get().count;
  return {
    total,
    healed,
    missingData,
    requiresHuman,
    selfRepairRate: total > 0 ? Math.round((healed / total) * 100) : 100
  };
}

// ─── Autonomous AI Evolution, Self-Updates & Feature Flags ────
function recordEvolutionChange({
  changeId,
  versionFrom,
  versionTo,
  reason,
  riskLevel = 'LOW_RISK',
  filesChanged = [],
  testsExecuted = [],
  testResults = 'PASSED',
  status = 'STAGED',
  healthCheckStatus = 'HEALTHY',
  rollbackOccurred = 0,
  backupPath = null,
  lessonsLearned = null
}) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO system_evolution_history (
      change_id, version_from, version_to, reason, risk_level, files_changed,
      tests_executed, test_results, status, health_check_status, rollback_occurred,
      backup_path, lessons_learned, created_at, deployed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  stmt.run(
    changeId,
    versionFrom,
    versionTo,
    reason,
    riskLevel,
    JSON.stringify(filesChanged || []),
    JSON.stringify(testsExecuted || []),
    testResults,
    status,
    healthCheckStatus,
    rollbackOccurred ? 1 : 0,
    backupPath,
    lessonsLearned
  );
  return changeId;
}

function updateEvolutionChange(changeId, updates = {}) {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(updates)) {
    fields.push(`${k} = ?`);
    vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
  }
  if (fields.length === 0) return false;
  vals.push(changeId);
  const stmt = db.prepare(`UPDATE system_evolution_history SET ${fields.join(', ')} WHERE change_id = ?`);
  const res = stmt.run(...vals);
  return res.changes > 0;
}

function getEvolutionHistory(limit = 50) {
  const rows = db.prepare('SELECT * FROM system_evolution_history ORDER BY id DESC LIMIT ?').all(limit);
  return rows.map(r => ({
    ...r,
    files_changed: JSON.parse(r.files_changed || '[]'),
    tests_executed: JSON.parse(r.tests_executed || '[]'),
  }));
}

function getEvolutionById(changeId) {
  const row = db.prepare('SELECT * FROM system_evolution_history WHERE change_id = ?').get(changeId);
  if (!row) return null;
  return {
    ...row,
    files_changed: JSON.parse(row.files_changed || '[]'),
    tests_executed: JSON.parse(row.tests_executed || '[]'),
  };
}

function getLatestHealthyEvolution() {
  const row = db.prepare("SELECT * FROM system_evolution_history WHERE status = 'DEPLOYED' AND health_check_status = 'HEALTHY' ORDER BY id DESC LIMIT 1").get();
  if (!row) return null;
  return {
    ...row,
    files_changed: JSON.parse(row.files_changed || '[]'),
    tests_executed: JSON.parse(row.tests_executed || '[]'),
  };
}

// ─── Feature Flags ─────────────────────────────────────────────
function setFeatureFlag(key, name, description, enabled = 1, riskLevel = 'LOW_RISK', metadata = {}) {
  const stmt = db.prepare(`
    INSERT INTO system_feature_flags (key, name, description, enabled, risk_level, metadata, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      enabled = excluded.enabled,
      description = coalesce(excluded.description, system_feature_flags.description),
      metadata = excluded.metadata,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(key, name, description, enabled ? 1 : 0, riskLevel, JSON.stringify(metadata || {}));
}

function getFeatureFlag(key) {
  const row = db.prepare('SELECT * FROM system_feature_flags WHERE key = ?').get(key);
  if (!row) return null;
  return {
    ...row,
    enabled: Boolean(row.enabled),
    metadata: JSON.parse(row.metadata || '{}')
  };
}

function getAllFeatureFlags() {
  const rows = db.prepare('SELECT * FROM system_feature_flags ORDER BY key ASC').all();
  return rows.map(r => ({
    ...r,
    enabled: Boolean(r.enabled),
    metadata: JSON.parse(r.metadata || '{}')
  }));
}

// ─── Approval Proposals (High-Risk Gates) ───────────────────────
function createApprovalProposal({ proposalId, title, description, riskLevel = 'HIGH_RISK', patchDiff = '', approvalToken }) {
  const stmt = db.prepare(`
    INSERT INTO system_pending_proposals (proposal_id, title, description, risk_level, patch_diff, approval_token, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', CURRENT_TIMESTAMP)
  `);
  stmt.run(proposalId, title, description, riskLevel, patchDiff, approvalToken);
  return proposalId;
}

function getPendingProposals() {
  return db.prepare("SELECT * FROM system_pending_proposals WHERE status = 'PENDING' ORDER BY created_at DESC").all();
}

function reviewProposal(proposalId, status = 'APPROVED', token = null) {
  const row = db.prepare('SELECT * FROM system_pending_proposals WHERE proposal_id = ?').get(proposalId);
  if (!row) throw new Error('Proposal not found');
  if (token && row.approval_token !== token) throw new Error('Invalid approval token');
  db.prepare("UPDATE system_pending_proposals SET status = ?, reviewed_at = CURRENT_TIMESTAMP WHERE proposal_id = ?").run(status, proposalId);
  return true;
}

/**
 * Safely reset database tables
 * @param {Object} options
 * @param {string} options.mode - 'data_only' (reminders, notes, memories, logs) or 'full' (factory reset)
 * @param {string} options.actorId - Who initiated the reset
 * @returns {Object}
 */
function resetDatabase(options = {}) {
  const mode = options.mode || 'data_only';
  const actorId = options.actorId || 'admin';
  const stats = {};
  const clearedTables = [];

  const runDelete = (tableName) => {
    try {
      const res = db.prepare(`DELETE FROM ${tableName}`).run();
      stats[tableName] = res.changes;
      clearedTables.push(tableName);
    } catch (_) {
      stats[tableName] = 0;
    }
  };

  const resetTx = db.transaction(() => {
    // 1. Reset operational & user-generated activity data
    runDelete('notes');
    runDelete('reminders');
    runDelete('memories');
    runDelete('action_history');
    runDelete('system_diagnostic_logs');
    runDelete('location_reminders');
    runDelete('offline_queue');
    runDelete('analytics_events');
    runDelete('reminder_completions');
    runDelete('user_learned_knowledge');
    runDelete('user_behavior_patterns');
    runDelete('user_gamification');
    runDelete('user_badges');
    runDelete('completed_tasks');
    runDelete('credential_change_tokens');
    runDelete('oauth_states');

    // Reset sqlite autoincrement sequences
    try {
      db.prepare(`
        DELETE FROM sqlite_sequence WHERE name IN (
          'notes', 'reminders', 'memories', 'action_history',
          'system_diagnostic_logs', 'location_reminders', 'offline_queue',
          'analytics_events', 'reminder_completions', 'user_learned_knowledge',
          'user_behavior_patterns', 'user_gamification', 'user_badges', 'completed_tasks'
        )
      `).run();
    } catch (_) {}

    // Reset user note count in legacy users table
    try {
      db.prepare('UPDATE users SET note_count = 0').run();
    } catch (_) {}

    if (mode === 'full') {
      // Factory Reset: Remove all non-admin users and user connections
      runDelete('user_connections');
      runDelete('user_audit_logs');
      try {
        db.prepare("DELETE FROM bot_authorized_users WHERE role != 'admin'").run();
        // Reset admin user to factory credentials: username=admin, password=123 (hashed)
        const security = require('./security');
        const defaultHash = security.hashPassword('123');
        db.prepare(`
          UPDATE bot_authorized_users
          SET password = ?, display_name = 'Admin User', bound_phone = NULL,
              status = 'active', role = 'admin', assigned_plan_id = 'enterprise',
              updated_at = CURRENT_TIMESTAMP
          WHERE role = 'admin' OR username = 'admin'
        `).run(defaultHash);
      } catch (userErr) {
        console.warn('Full reset user cleanup error:', userErr.message);
      }
    }
  });

  resetTx();

  try {
    db.pragma('vacuum');
  } catch (_) {}

  return {
    success: true,
    mode,
    clearedTables,
    stats,
    message: mode === 'full' 
      ? 'ফ্যাক্টরি রিসেট সম্পন্ন হয়েছে: সকল ডাটা মুছে ফেলা হয়েছে এবং ডিফল্ট অ্যাডমিন (admin / 123) অ্যাকাউন্ট বহাল রাখা হয়েছে।'
      : 'ডাটাবেস রিসেট সম্পন্ন হয়েছে: সকল রিমাইন্ডার, নোট, মেমোরি ও লগ মুছে ফেলা হয়েছে (ইউজার অ্যাকাউন্ট সংরক্ষিত রয়েছে)।'
  };
}

module.exports = {
  saveNote, getNotes, searchNotes, deleteNote, deleteAllNotes, getNoteById, getRecentNotes,
  updateNote, restoreNoteWithId,
  saveReminder, getPendingReminders, markReminderSent, getActiveReminders, deleteReminder, deleteAllReminders,
  getReminderById, updateReminder, restoreReminderWithId,
  claimReminder, markReminderDelivered, recordReminderDeliveryAttempt, recoverPendingReminders, getReminderDiagnostic, updateReminderStatus, updateReminderGoogleEventId,
  recordAction, getLastAction, markActionUndone, getActionHistory,
  saveMemory, getMemories, getRecentMemory, searchMemories, forgetMemory, deleteMemory,
  getOrCreateUser, getUserStats, getAllUsers,
  logDiagnosticEvent, getDiagnosticLogs, getDiagnosticStats,
  recordEvolutionChange, updateEvolutionChange, getEvolutionHistory, getEvolutionById, getLatestHealthyEvolution,
  setFeatureFlag, getFeatureFlag, getAllFeatureFlags,
  createApprovalProposal, getPendingProposals, reviewProposal,
  resetDatabase,
  prepare: (sql) => db.prepare(sql),
  rawDb: db,
};
