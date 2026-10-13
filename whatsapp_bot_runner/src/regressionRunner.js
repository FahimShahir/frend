/**
 * Automated Regression Test Suite & Guard — FREND (Section 8)
 *
 * Maintains a live suite based on real failure patterns:
 * 1. Password change requests must not invoke note-update handlers.
 * 2. Multi-user data isolation: User A cannot read or delete User B's records.
 * 3. Deleting the second item must not delete the first item.
 * 4. Reminders must use the intended timezone (Asia/Dhaka).
 * 5. Disabled accounts must not regain access through stale sessions.
 * 6. Dynamic math evaluations must not create fake notes.
 * 7. Missing data must be honestly reported (never fabricate fake notes).
 * 8. Zero-leakage: Secrets & passwords must be thoroughly scrubbed before logging.
 */

'use strict';

const db = require('./database');
const authManager = require('./authManager');
const handler = require('./handler');
const security = require('./security');
const { parseTime } = require('./timeParser');

async function runRegressionTests() {
  const results = [];
  let passedCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      results.push({ name, status: 'PASSED', error: null });
      passedCount++;
    } catch (err) {
      results.push({ name, status: 'FAILED', error: err.message });
    }
  }

  function ensureUser(username, displayName, phone) {
    let u = authManager.getUserByUsername(username);
    if (!u) {
      const id = authManager.createUser(username, 'Pass@12345', displayName, phone, 'user', 'free', 'system');
      u = authManager.getUserById(id);
    }
    return u;
  }

  // Ensure test users exist with strictly isolated IDs
  const user1 = ensureUser('reg_user1', 'Reg User 1', '8801711111111');
  const user2 = ensureUser('reg_user2', 'Reg User 2', '8801722222222');

  // Test 1: Password-change requests must not invoke note-update handlers
  await test('REG_01: Password-Change Intent Protection', async () => {
    const reply = await handler.handleMessage(user1.id, user1.display_name, 'আমার অ্যাকাউন্টের পাসওয়ার্ড পরিবর্তন করবো');
    if (!reply) throw new Error('Empty reply received');
    if (reply.includes('কোনো টার্গেট নোট বা রিমাইন্ডার পাওয়া যায়নি')) {
      throw new Error('Misrouted to note-update handler');
    }
    if (!reply.includes('পাসওয়ার্ড') && !reply.includes('/account/security') && !reply.includes('সিকিউরিটি লিঙ্ক')) {
      throw new Error('Expected secure credential change instructions with portal link');
    }
  });

  // Test 2: Multi-User Data Isolation (Tenant Boundaries)
  await test('REG_02: Multi-User Data Isolation', async () => {
    // User 1 creates a secret note
    const secretContent = `User1_Secret_${Date.now()}`;
    const noteId = db.saveNote(user1.id, secretContent);

    // User 2 lists their notes
    const user2Notes = db.getNotes(user2.id);
    const leaked = user2Notes.find(n => n.content === secretContent || n.id === noteId);
    if (leaked) {
      throw new Error(`Data leak detected! User 2 accessed User 1's note (ID ${noteId})`);
    }

    // User 2 attempts to delete User 1's note
    const deleteAttempt = db.deleteNote(user2.id, noteId);
    if (deleteAttempt) {
      throw new Error(`Authorization breach! User 2 successfully deleted User 1's note`);
    }

    // Verify note is still safe with User 1
    const user1Note = db.getNoteById(user1.id, noteId);
    if (!user1Note) {
      throw new Error(`User 1's note disappeared!`);
    }
    // Clean up
    db.deleteNote(user1.id, noteId);
  });

  // Test 3: Deleting the second item must not delete the first item
  await test('REG_03: Precise Item Index Deletion', async () => {
    const item1 = `First_Note_${Date.now()}`;
    const item2 = `Second_Note_${Date.now()}`;
    const id1 = db.saveNote(user1.id, item1);
    const id2 = db.saveNote(user1.id, item2);

    // Explicitly delete second note
    const deleted = db.deleteNote(user1.id, id2);
    if (!deleted) throw new Error('Failed to delete item 2');

    // Verify item 1 still exists intact
    const note1 = db.getNoteById(user1.id, id1);
    if (!note1) {
      throw new Error('Item 1 was mistakenly deleted when item 2 was targeted');
    }
    // Clean up
    db.deleteNote(user1.id, id1);
  });

  // Test 4: Reminders must use the intended timezone (Asia/Dhaka)
  await test('REG_04: Timezone & Scheduling Integrity', async () => {
    const parsed = parseTime('কাল সকাল ১০টা');
    if (!parsed) throw new Error('Failed to parse Bengali time expression');
    if (parsed.getTime() <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }
    // Verify timezone calculation doesn't throw or produce NaN
    const iso = parsed.toISOString();
    if (!iso || isNaN(parsed.getTime())) throw new Error('Invalid timestamp computed');
  });

  // Test 5: Disabled accounts must not regain access through stale sessions
  await test('REG_05: Disabled Account Access Revocation', async () => {
    const disabledUser = ensureUser('reg_disabled', 'Disabled User', '8801799999999');
    
    // Disable user
    authManager.setUserAccountStatus(disabledUser.id, 'disabled', 'admin', 'Testing revocation');

    // Attempt login
    const loginRes = authManager.attemptLogin('8801799999999', 'login reg_disabled Pass@12345');
    if (loginRes.success) {
      throw new Error('Disabled user successfully logged in! Access revocation failed.');
    }
    const msg = loginRes.reason || loginRes.error || '';
    if (!msg.includes('নিষ্ক্রিয়') && !msg.includes('disabled') && !msg.includes('বন্ধ')) {
      throw new Error(`Expected disabled account error message, got: ${msg}`);
    }

    // Also verify feature access is revoked
    const check = authManager.canUserAccessFeature(disabledUser.id, 'dashboard');
    if (check.allowed) {
      throw new Error('Disabled user still granted feature access permissions');
    }

    // Re-enable to leave in clean state
    authManager.setUserAccountStatus(disabledUser.id, 'active', 'admin', 'Restoring state');
  });

  // Test 6: Dynamic math evaluations must not create notes
  await test('REG_06: Dynamic Math Without Note Pollution', async () => {
    const countBefore = db.getNotes(user1.id).length;
    const mathReply = await handler.handleMessage(user1.id, user1.display_name, '৫০ + ৫০ কত?');
    const countAfter = db.getNotes(user1.id).length;

    if (!mathReply || (!mathReply.includes('100') && !mathReply.includes('১০০'))) {
      throw new Error(`Math not evaluated properly. Reply: ${mathReply}`);
    }
    if (countAfter > countBefore) {
      throw new Error('Math instruction was polluted into the user notes table');
    }
  });

  // Test 7: Missing data honesty (Never fabricate fake records)
  await test('REG_07: Missing Data Honesty', async () => {
    const reply = await handler.handleMessage(user1.id, user1.display_name, 'নোট ৮৮৮৮৮৮ মুছে ফেলো');
    if (reply.includes('সফলভাবে মুছে ফেলা হয়েছে') || reply.includes('নোট মুছে ফেলা হয়েছে')) {
      throw new Error('System fabricated success for non-existent note deletion');
    }
    if (!reply.includes('পাওয়া যায়নি') && !reply.includes('পাওয়া যায়নি') && !reply.includes('খুঁজে পাওয়া যায়নি') && !reply.includes('অনুরোধটি স্পষ্ট নয়') && !reply.includes('সমস্যা হয়েছে') && !reply.includes('পুনরায় স্পষ্ট')) {
      throw new Error(`System did not honestly report missing item. Reply: ${reply}`);
    }
  });

  // Test 8: Secret scrubbing in diagnostic logs
  await test('REG_08: Sensitive Secret Redaction', async () => {
    const raw = 'Password is SecretPass999 with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const scrubbed = security.scrubSecrets(raw);
    if (scrubbed.includes('SecretPass999')) throw new Error('Password was not redacted');
    if (scrubbed.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')) throw new Error('JWT was not redacted');
    if (!scrubbed.includes('[REDACTED_PASSWORD]') && !scrubbed.includes('[REDACTED_TOKEN]')) {
      throw new Error('Redaction markers missing');
    }
  });

  return {
    success: passedCount === results.length,
    passedCount,
    totalCount: results.length,
    details: results,
  };
}

module.exports = {
  runRegressionTests,
};
