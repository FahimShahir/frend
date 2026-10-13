/**
 * Universal Action Engine — FREND
 * Implements the 9-step Universal Action Execution Workflow:
 * 1. Understand -> 2. Resolve -> 3. Validate -> 4. Prepare ->
 * 5. Execute -> 6. Verify -> 7. Synchronize -> 8. Record -> 9. Continue
 *
 * Supports:
 * - Create, Update (append, shorten, replace, rename), Delete, Clear
 * - Dynamic ordinal resolution (1st, 2nd, last, previous, this, it)
 * - Persistent Action History & Safe Undo (Rule 4, 8, 13)
 * - Anti-stale target resolution (Rule 6)
 * - Short, truthful responses (Rule 14)
 * - Multi-language (Bangla, Banglish, English)
 */

'use strict';

const db = require('./database');
const { parseTime, formatTime, formatRelativeTime, convertBnDigits } = require('./timeParser');
const calendarSync = require('./calendarSync');
const analytics = require('./analytics');
const gamification = require('./gamification');
const selfHealingEngine = require('./selfHealingEngine');
const crypto = require('crypto');

function generateOpId() {
  return 'op_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

/**
 * Resolves natural language or ordinal references to a stable resource in the CURRENT authoritative database state.
 * Rule 6: Never reuses stale positions! Always resolves immediately against fresh database queries.
 */
function resolveTargetResource(userId, resourceType, targetRef) {
  const norm = (targetRef || '').trim().toLowerCase();
  const converted = convertBnDigits(norm);

  // 1. Get fresh authoritative state
  const notes = db.getNotes(userId, 50); // ordered by id ASC (1 = first in list, 2 = second, etc.)
  const reminders = db.getActiveReminders(userId); // ordered by remind_at ASC

  // 2. Check for "it", "this", "that", "ওইটা", "এটা", "পূর্বেরটা", "আগেরটা" (when used as reference to previously acted resource)
  if (/^(it|this|that|oita|eta|arokom|preceding|পূর্বেরটা|এটা|ওইটা)$/i.test(norm)) {
    const lastAction = db.getLastAction(userId);
    if (lastAction && lastAction.target_id) {
      if (lastAction.resource_type === 'note') {
        const note = db.getNoteById(userId, parseInt(lastAction.target_id, 10));
        if (note) return { type: 'note', item: note, id: note.id };
      } else if (lastAction.resource_type === 'reminder') {
        const rem = db.getReminderById(userId, parseInt(lastAction.target_id, 10));
        if (rem) return { type: 'reminder', item: rem, id: rem.id };
      }
    }
  }

  // 3. Check for "last", "previous", "শেষেরটা", "আগেরটা", "লাস্টেরটা", "ager ta", "sesher ta"
  if (/^(last|previous|prev|sesh|sesher\s*ta|ager\s*ta|শেষেরটা|আগেরটা|লাস্টেরটা)$/i.test(norm)) {
    if (resourceType === 'reminder') {
      if (reminders.length > 0) return { type: 'reminder', item: reminders[0], id: reminders[0].id };
    } else {
      const rec = db.getRecentNotes(userId, 1);
      if (rec.length > 0) return { type: 'note', item: rec[0], id: rec[0].id };
      if (reminders.length > 0) return { type: 'reminder', item: reminders[0], id: reminders[0].id };
    }
  }

  // 4. Check for explicit primary key ID with hash: "#12" or "id 12"
  const explicitIdMatch = converted.match(/#(\d+)|(?:^|\s)(?:id|আইডি)\s*(\d+)/i);
  if (explicitIdMatch) {
    const exactId = parseInt(explicitIdMatch[1] || explicitIdMatch[2], 10);
    if (resourceType === 'reminder') {
      const rem = db.getReminderById(userId, exactId);
      if (rem) return { type: 'reminder', item: rem, id: rem.id };
    }
    const note = db.getNoteById(userId, exactId);
    if (note) return { type: 'note', item: note, id: note.id };
    const rem = db.getReminderById(userId, exactId);
    if (rem) return { type: 'reminder', item: rem, id: rem.id };
  }

  // 5. Ordinal positions: "1st", "2nd", "3rd", "১ম", "২য়", "৩য়", "প্রথমটা", "দ্বিতীয়টা", "prothom ta", "dwitiyo ta"
  const ordinals = [
    { regex: /(?:1st|first|১ম|প্রথম(?:টা)?|prothom)/i, idx: 0 },
    { regex: /(?:2nd|second|২[য়য়]|দ্বিতী[য়য](?:টা)?|dwitiyo)/i, idx: 1 },
    { regex: /(?:3rd|third|৩[য়য়]|তৃতী[য়য](?:টা)?|tritiyo)/i, idx: 2 },
    { regex: /(?:4th|fourth|৪র্থ|চতুর্থ(?:টা)?)/i, idx: 3 },
    { regex: /(?:5th|fifth|৫ম|পঞ্চম(?:টা)?)/i, idx: 4 },
  ];

  for (const ord of ordinals) {
    if (ord.regex.test(norm)) {
      const idx = ord.idx;
      if (resourceType === 'reminder') {
        if (reminders[idx]) return { type: 'reminder', item: reminders[idx], id: reminders[idx].id };
      } else {
        if (notes[idx]) return { type: 'note', item: notes[idx], id: notes[idx].id };
        if (reminders[idx]) return { type: 'reminder', item: reminders[idx], id: reminders[idx].id };
      }
    }
  }

  // 6. Numbered visible position: e.g. "note number 2", "note 2", "2", "২", "১", "number 1", "নোট ২"
  const posMatch = converted.match(/(?:note|নোট|reminder|রিমাইন্ডার)?\s*(?:number|নম্বর)?\s*(\d+)(?:\s*(?:নম্বর|ta|টা))?/i);
  if (posMatch) {
    const pos = parseInt(posMatch[1], 10);
    const idx = pos - 1; // 1-based index to 0-based
    if (resourceType === 'reminder') {
      if (reminders[idx]) return { type: 'reminder', item: reminders[idx], id: reminders[idx].id };
    } else {
      if (notes[idx]) return { type: 'note', item: notes[idx], id: notes[idx].id };
      if (reminders[idx]) return { type: 'reminder', item: reminders[idx], id: reminders[idx].id };
    }

    // Fallback: if position was out of visible range, check if pos is a database primary key
    const noteById = db.getNoteById(userId, pos);
    if (noteById) return { type: 'note', item: noteById, id: noteById.id };
    const remById = db.getReminderById(userId, pos);
    if (remById) return { type: 'reminder', item: remById, id: remById.id };
  }

  // 7. Search keyword matching
  if (norm.length >= 2) {
    const matchedNotes = db.searchNotes(userId, norm);
    if (matchedNotes && matchedNotes.length > 0) {
      return { type: 'note', item: matchedNotes[0], id: matchedNotes[0].id };
    }
    const matchedRem = reminders.find(r => r.content.toLowerCase().includes(norm));
    if (matchedRem) {
      return { type: 'reminder', item: matchedRem, id: matchedRem.id };
    }
  }

  // 8. Default fallback to most recent note if exists
  if (notes.length > 0 && resourceType !== 'reminder') {
    return { type: 'note', item: notes[0], id: notes[0].id };
  }
  if (reminders.length > 0) {
    return { type: 'reminder', item: reminders[0], id: reminders[0].id };
  }

  return null;
}

/**
 * Universal Action Dispatcher
 * Implements full 9-step execution workflow
 */
async function executeUniversalAction(userId, userName, actionRequest) {
  const { intent, resourceType = 'note', targetRef = '', parameters = {} } = actionRequest;
  const opId = generateOpId();

  // ── 1. CREATE / ADD ──────────────────────────────────────────
  if (intent === 'create' || intent === 'add') {
    if (resourceType === 'reminder') {
      const content = parameters.content || 'রিমাইন্ডার';
      const time = parameters.remindAt || parseTime(parameters.timeHint || 'কাল সকাল ১০টা') || new Date(Date.now() + 3600000);
      const reminderId = db.saveReminder(userId, content, time);

      let calMsg = '';
      let googleEventId = null;
      if (calendarSync.isConfigured() || calendarSync.getUserAuthClient(userId)) {
        const calRes = await calendarSync.addToGoogleCalendar(userId, content, time).catch(() => null);
        if (calRes) {
          calMsg = '\n📅 _Google Calendar-এ সিঙ্ক হয়েছে_';
          if (typeof calRes === 'object' && calRes.eventId) {
            googleEventId = calRes.eventId;
            db.updateReminderGoogleEventId(reminderId, googleEventId);
          }
        }
      }

      const afterState = { id: reminderId, content, remind_at: time.toISOString(), google_event_id: googleEventId };
      db.recordAction(userId, opId, 'create', 'reminder', reminderId, `Created reminder "${content}"`, null, afterState, 'SUCCESS');
      analytics.trackEvent(userId, 'action_create_reminder', content);

      return (
        `⏰ *রিমাইন্ডার তৈরি করা হয়েছে এবং সংরক্ষিত!*\n\n` +
        `📌 *${content}*\n` +
        `🕒 *সময়:* ${formatTime(time)} (${formatRelativeTime(time)})` +
        calMsg +
        `\n\n_রিমাইন্ডার নম্বর: #${reminderId}_`
      );
    } else {
      // Create Note
      const content = parameters.content || '';
      if (!content || content.length < 1) {
        return '❌ কী নোট হিসেবে সেভ করতে চাও বলো!';
      }
      const noteId = db.saveNote(userId, content, parameters.tags || '');
      const afterState = { id: noteId, content, tags: parameters.tags || '' };
      db.recordAction(userId, opId, 'create', 'note', noteId, `Created note "${content}"`, null, afterState, 'SUCCESS');
      analytics.trackEvent(userId, 'action_create_note', content);

      return (
        `🧠 *মনে রেখেছি এবং সংরক্ষিত!*\n\n` +
        `📝 ${content}\n\n` +
        `_নোট নম্বর: #${noteId}_\n` +
        `_মুছতে চাইলে বলবে: ডিলিট_`
      );
    }
  }

  // ── 2. UPDATE / EDIT / SHORTEN / APPEND / RENAME ──────────────
  if (intent === 'update' || intent === 'edit' || intent === 'modify' || intent === 'rename') {
    const resolved = resolveTargetResource(userId, resourceType, targetRef);
    if (!resolved) {
      return await selfHealingEngine.diagnoseAndHeal({
        userId,
        userName,
        userMessage: text,
        attemptedIntent: 'update',
        initialReply: '❌ আপডেটের জন্য কোনো টার্গেট নোট বা রিমাইন্ডার খুঁজে পাওয়া যায়নি। প্রথমে একটি নোট তৈরি করো।'
      });
    }

    if (resolved.type === 'note') {
      const oldNote = resolved.item;
      const beforeState = { ...oldNote };
      let updatedContent = oldNote.content;

      if (parameters.mode === 'append' || parameters.append) {
        const toAdd = parameters.content || parameters.items || '';
        updatedContent = `${oldNote.content}\n• ${toAdd}`;
      } else if (parameters.mode === 'shorten' || parameters.shorten) {
        const lines = oldNote.content.split('\n').filter(Boolean);
        if (lines.length > 2) {
          updatedContent = lines.slice(0, 2).join(' · ');
        } else {
          updatedContent = oldNote.content.slice(0, Math.min(oldNote.content.length, 50));
        }
      } else if (parameters.content) {
        updatedContent = parameters.content;
      }

      db.updateNote(userId, resolved.id, updatedContent);
      const afterState = { id: resolved.id, content: updatedContent };
      db.recordAction(userId, opId, 'update', 'note', resolved.id, `Updated note #${resolved.id}`, beforeState, afterState, 'SUCCESS');
      analytics.trackEvent(userId, 'action_update_note', String(resolved.id));

      return (
        `✏️ *নোট #${resolved.id} সফলভাবে আপডেট করা হয়েছে!*\n\n` +
        `📝 *বর্তমান বিষয়বস্তু:*\n${updatedContent}\n\n` +
        `_পূর্বের অবস্থায় ফেরাতে বলবে: Undo_`
      );
    } else if (resolved.type === 'reminder') {
      const oldRem = resolved.item;
      const beforeState = { ...oldRem };
      let newContent = parameters.content || oldRem.content;
      let newTime = parameters.remindAt || (parameters.timeHint ? parseTime(parameters.timeHint) : null);

      db.updateReminder(userId, resolved.id, newContent, newTime);
      const afterState = { id: resolved.id, content: newContent, remind_at: newTime ? newTime.toISOString() : oldRem.remind_at };
      db.recordAction(userId, opId, 'update', 'reminder', resolved.id, `Updated reminder #${resolved.id}`, beforeState, afterState, 'SUCCESS');
      analytics.trackEvent(userId, 'action_update_reminder', String(resolved.id));

      return (
        `✏️ *রিমাইন্ডার #${resolved.id} আপডেট করা হয়েছে!*\n\n` +
        `📌 ${newContent}\n` +
        (newTime ? `🕒 নতুন সময়: ${formatTime(newTime)}\n` : '') +
        `\n_পূর্বের অবস্থায় ফেরাতে বলবে: Undo_`
      );
    }
  }

  // ── 3. DELETE / REMOVE / CLEAR ────────────────────────────────
  if (intent === 'delete' || intent === 'remove' || intent === 'clear') {
    // Check clear all
    if (targetRef === 'all' || parameters.all) {
      const notes = db.getNotes(userId, 100);
      const rems = db.getActiveReminders(userId);
      const beforeState = { notes, reminders: rems };

      const nDeleted = db.deleteAllNotes(userId);
      const rDeleted = db.deleteAllReminders(userId);

      // Clean up Google Calendar events for cleared reminders
      if (rems && rems.length > 0) {
        for (const rem of rems) {
          calendarSync.deleteGoogleCalendarEventBySummaryOrId(userId, rem.google_event_id, rem.content).catch(() => {});
        }
      }

      db.recordAction(userId, opId, 'delete', 'all', 'all', 'Cleared all items', beforeState, { notesCount: nDeleted, remCount: rDeleted }, 'SUCCESS');
      analytics.trackEvent(userId, 'action_clear_all');

      return (
        `🗑️ *তোমার সকল সংরক্ষিত তথ্য মুছে পরিষ্কার করা হয়েছে!*\n\n` +
        `📝 নোট মোছা হয়েছে: *${nDeleted}টি*\n` +
        `⏰ রিমাইন্ডার বাতিল: *${rDeleted}টি*\n\n` +
        `_ভুলবশত মুছলে বলবে: Undo_`
      );
    }

    const resolved = resolveTargetResource(userId, resourceType, targetRef);
    if (!resolved) {
      // If resourceType is reminder or targetRef indicates calendar event, try deleting directly from Google Calendar
      if (resourceType === 'reminder' || /calendar|ক্যালেন্ডার/i.test(targetRef || '')) {
        const calDeleted = await calendarSync.deleteGoogleCalendarEventBySummaryOrId(userId, null, targetRef);
        if (calDeleted) {
          return `🗑️ *Google Calendar থেকে ইভেন্ট ("${targetRef}") সফলভাবে মুছে ফেলা হয়েছে!*`;
        }
      }
      return '📭 মোছার মতো কোনো নোট বা রিমাইন্ডার খুঁজে পাওয়া যায়নি।';
    }

    if (resolved.type === 'note') {
      const beforeState = { ...resolved.item };
      db.deleteNote(userId, resolved.id);
      db.recordAction(userId, opId, 'delete', 'note', resolved.id, `Deleted note #${resolved.id}`, beforeState, null, 'SUCCESS');
      analytics.trackEvent(userId, 'action_delete_note', String(resolved.id));

      return (
        `🗑️ *নোট #${resolved.id} ("${resolved.item.content}") সফলভাবে মুছে দেওয়া হয়েছে!*\n\n` +
        `~~${resolved.item.content}~~\n\n` +
        `_পুনরুদ্ধার করতে বলবে: Undo_`
      );
    } else {
      const beforeState = { ...resolved.item };
      db.deleteReminder(userId, resolved.id);

      // Delete from Google Calendar
      let calDeletedMsg = '';
      try {
        const calDeleted = await calendarSync.deleteGoogleCalendarEventBySummaryOrId(
          userId,
          resolved.item.google_event_id,
          resolved.item.content
        );
        if (calDeleted) {
          calDeletedMsg = '\n📅 _Google Calendar থেকেও মুছে ফেলা হয়েছে_';
        }
      } catch (e) {
        console.warn('[Calendar] Delete sync error:', e.message);
      }

      db.recordAction(userId, opId, 'delete', 'reminder', resolved.id, `Deleted reminder #${resolved.id}`, beforeState, null, 'SUCCESS');
      analytics.trackEvent(userId, 'action_delete_reminder', String(resolved.id));

      return (
        `🗑️ *রিমাইন্ডার #${resolved.id} ("${resolved.item.content}") বাতিল করা হয়েছে!*` +
        calDeletedMsg +
        `\n\n~~${resolved.item.content}~~\n\n` +
        `_পুনরুদ্ধার করতে বলবে: Undo_`
      );
    }
  }

  // ── 4. UNDO / REVERT ──────────────────────────────────────────
  if (intent === 'undo' || intent === 'revert') {
    const lastAction = db.getLastAction(userId);
    if (!lastAction) {
      return '❌ Undo করার মতো কোনো আগের কাজ খুঁজে পাওয়া যায়নি।';
    }

    const { intent: prevIntent, resource_type: rType, before_state: before, after_state: after, operation_id: prevOpId } = lastAction;

    if (prevIntent === 'create') {
      if (rType === 'note' && after && after.id) {
        db.deleteNote(userId, after.id);
        db.markActionUndone(prevOpId);
        return `↩️ *Undo সম্পন্ন!* নতুন তৈরি করা নোট #${after.id} মুছে দেওয়া হয়েছে।`;
      } else if (rType === 'reminder' && after && after.id) {
        db.deleteReminder(userId, after.id);
        calendarSync.deleteGoogleCalendarEventBySummaryOrId(userId, after.google_event_id, after.content).catch(() => {});
        db.markActionUndone(prevOpId);
        return `↩️ *Undo সম্পন্ন!* রিমাইন্ডার #${after.id} বাতিল করা হয়েছে।`;
      }
    } else if (prevIntent === 'delete') {
      if (rType === 'note' && before) {
        db.restoreNoteWithId(userId, before.id, before.content, before.tags || '', before.created_at);
        db.markActionUndone(prevOpId);
        return (
          `↩️ *Undo সম্পন্ন! মুছে ফেলা নোটটি ফিরিয়ে আনা হয়েছে:*\n\n` +
          `📝 ${before.content} (#${before.id})`
        );
      } else if (rType === 'reminder' && before) {
        db.restoreReminderWithId(userId, before.id, before.content, before.remind_at, before.is_sent || 0, before.created_at);
        db.markActionUndone(prevOpId);
        return (
          `↩️ *Undo সম্পন্ন! মুছে ফেলা রিমাইন্ডারটি ফিরিয়ে আনা হয়েছে:*\n\n` +
          `⏰ ${before.content} (#${before.id})`
        );
      } else if (rType === 'all' && before) {
        if (before.notes) {
          for (const n of before.notes) {
            db.restoreNoteWithId(userId, n.id, n.content, n.tags, n.created_at);
          }
        }
        if (before.reminders) {
          for (const r of before.reminders) {
            db.restoreReminderWithId(userId, r.id, r.content, r.remind_at, r.is_sent, r.created_at);
          }
        }
        db.markActionUndone(prevOpId);
        return `↩️ *Undo সম্পন্ন!* তোমার সব মুছে ফেলা তথ্য সম্পূর্ণভাবে ফিরিয়ে আনা হয়েছে।`;
      }
    } else if (prevIntent === 'update') {
      if (rType === 'note' && before) {
        db.updateNote(userId, before.id, before.content, before.tags || '');
        db.markActionUndone(prevOpId);
        return (
          `↩️ *Undo সম্পন্ন! নোট #${before.id} পূর্বের অবস্থায় ফিরিয়ে নেওয়া হয়েছে:*\n\n` +
          `📝 ${before.content}`
        );
      } else if (rType === 'reminder' && before) {
        db.updateReminder(userId, before.id, before.content, before.remind_at);
        db.markActionUndone(prevOpId);
        return (
          `↩️ *Undo সম্পন্ন! রিমাইন্ডার #${before.id} পূর্বের অবস্থায় ফিরিয়ে নেওয়া হয়েছে:*\n\n` +
          `⏰ ${before.content}`
        );
      }
    } else if (prevIntent === 'complete' && before) {
      if (before.type === 'reminder' && before.item) {
        db.restoreReminderWithId(userId, before.item.id, before.item.content, before.item.remind_at, 0, before.item.created_at);
        db.markActionUndone(prevOpId);
        return `↩️ *Undo সম্পন্ন!* সম্পন্ন হওয়া রিমাইন্ডার #${before.item.id} ("${before.item.content}") পুনরায় সক্রিয় তালিকায় ফিরিয়ে আনা হয়েছে।`;
      } else if (before.type === 'note' && before.item) {
        db.restoreNoteWithId(userId, before.item.id, before.item.content, before.item.tags || '', before.item.created_at);
        db.markActionUndone(prevOpId);
        return `↩️ *Undo সম্পন্ন!* সম্পন্ন হওয়া নোট #${before.item.id} ("${before.item.content}") পুনরায় ফিরিয়ে আনা হয়েছে।`;
      }
    }

    return `⚠️ এই কাজটি রিভার্স করা সম্ভব হয়নি।`;
  }

  // ── 5. COMPLETE ───────────────────────────────────────────────
  if (intent === 'complete') {
    const reminders = db.getActiveReminders(userId);
    let resolved = null;

    if (reminders.length > 0) {
      if (targetRef && targetRef.length > 1 && !/^(কাজ\s*শেষ|done|complete|সম্পন্ন)$/i.test(targetRef.trim())) {
        const found = reminders.find(r =>
          r.content.toLowerCase().includes(targetRef.toLowerCase()) ||
          targetRef.toLowerCase().includes(r.content.toLowerCase())
        );
        if (found) {
          resolved = { type: 'reminder', item: found, id: found.id };
        }
      }
      if (!resolved) {
        resolved = { type: 'reminder', item: reminders[0], id: reminders[0].id };
      }
    }

    if (!resolved) {
      resolved = resolveTargetResource(userId, 'reminder', targetRef) || resolveTargetResource(userId, 'note', targetRef);
    }

    let completedContent = resolved ? resolved.item.content : (targetRef || 'কাজ সম্পন্ন');
    let beforeState = null;
    let deletedNotice = '';

    if (resolved) {
      completedContent = resolved.item.content;
      beforeState = { type: resolved.type, item: resolved.item };
      if (resolved.type === 'reminder') {
        db.markReminderSent(resolved.id);
        db.deleteReminder(userId, resolved.id);
        calendarSync.deleteGoogleCalendarEventBySummaryOrId(userId, resolved.item.google_event_id, resolved.item.content).catch(() => {});
        deletedNotice = `🗑️ *রিমাইন্ডার #${resolved.id} ("${resolved.item.content}") সম্পন্ন হওয়ায় মুছে ফেলা হলো।*`;
      } else {
        db.deleteNote(userId, resolved.id);
        deletedNotice = `🗑️ *নোট #${resolved.id} ("${resolved.item.content}") সম্পন্ন হওয়ায় মুছে ফেলা হলো।*`;
      }
    }

    const gamifyRes = gamification.completeTask(userId, completedContent, 'whatsapp');
    db.recordAction(userId, opId, 'complete', resolved ? resolved.type : 'task', resolved ? resolved.id : null, `Completed "${completedContent}"`, beforeState, null, 'SUCCESS');
    analytics.trackEvent(userId, 'action_complete_task', completedContent);

    return (
      `🎉 *কাজ সম্পন্ন!*\n\n` +
      `📌 *${completedContent}*\n` +
      (deletedNotice ? `${deletedNotice}\n` : '') +
      `✨ *+${gamifyRes.pointsAwarded} XP* অর্জন করেছো! (মোট: ${gamifyRes.totalPoints} XP · Level ${gamifyRes.level})\n\n` +
      `_ভুলবশত হয়ে থাকলে বলবে: Undo_`
    );
  }

  // ── 6. LIST ───────────────────────────────────────────────────
  if (intent === 'list') {
    if (resourceType === 'reminder') {
      const reminders = db.getActiveReminders(userId);
      if (reminders.length === 0) {
        return `📭 *কোনো সক্রিয় রিমাইন্ডার নেই।*\n\n"কাল সকাল ১০টায় মিটিং" লিখে রিমাইন্ডার সেট করো।`;
      }
      const list = reminders.map((r, i) => {
        const time = new Date(r.remind_at);
        return `*${i + 1}.* ${r.content}\n   🕐 ${formatTime(time)} · _#${r.id}_`;
      }).join('\n\n');
      return `*⏰ তোমার সক্রিয় রিমাইন্ডার (${reminders.length}টি):*\n\n${list}\n\n_বাতিল করতে: ডিলিট [নম্বর]_`;
    } else {
      const notes = db.getNotes(userId, 50);
      if (notes.length === 0) {
        return `📭 *এখনো কোনো নোট নেই!*\n\n"মনে রাখ: [কথা]" লিখে শুরু করো।`;
      }
      const noteList = notes.map((n, i) => {
        const d = new Date(n.created_at + 'Z');
        const dStr = d.toLocaleDateString('bn-BD', { timeZone: 'Asia/Dhaka', month: 'short', day: 'numeric' });
        return `*${i + 1}.* ${n.content}\n   _📅 ${dStr} · #${n.id}_`;
      }).join('\n\n');
      return `*📋 তোমার বর্তমান নোটগুলো (${notes.length}টি):*\n\n${noteList}\n\n_মুছতে: ডিলিট [নম্বর]_`;
    }
  }

  // ── 7. SEARCH ─────────────────────────────────────────────────
  if (intent === 'search') {
    const q = parameters.query || targetRef || '';
    if (!q || q.length < 2) {
      return '❌ কী খুঁজবো বলো! যেমন: "খুঁজে দে ডাক্তার"';
    }
    const results = db.searchNotes(userId, q);
    if (!results || results.length === 0) {
      return `🔍 *"${q}"* সম্পর্কিত কোনো তথ্য পাওয়া যায়নি।`;
    }
    const noteList = results.map((n, i) => `*${i + 1}.* ${n.content} _(#${n.id})_`).join('\n\n');
    return `🔍 *"${q}"* এর জন্য ${results.length}টি নোট:\n\n${noteList}`;
  }

  // ── 8. MEMORY QUERY (Section 5, 6, 7, 11) ──────────────────────
  if (intent === 'memory_query' || intent === 'query_memory') {
    const memType = parameters.memoryType || '';
    const q = parameters.query || targetRef || '';

    // Check meeting memory
    if (memType === 'meeting' || /মিটিং|meeting|সিদ্ধান্ত|decision/i.test(q)) {
      const recentMeeting = db.getRecentMemory(userId, 'meeting');
      if (recentMeeting) {
        let reply = `🎙️ *মিটিং মেমরি (${recentMeeting.title || 'রেকর্ডিং'}):*\n\n`;
        const data = recentMeeting.structured_data || {};
        if (data.decisions && data.decisions.length > 0) {
          reply += `✅ *গৃহীত সিদ্ধান্তসমূহ:*\n`;
          data.decisions.forEach((d) => { reply += `• ${d}\n`; });
          reply += `\n`;
        }
        if (data.actionItems && data.actionItems.length > 0) {
          reply += `📌 *অ্যাকশন আইটেম ও ডেডলাইন:*\n`;
          data.actionItems.forEach(a => {
            reply += `• ${a.task}${a.deadline ? ` (ডেডলাইন: ${a.deadline})` : ''}${a.owner ? ` — ${a.owner}` : ''}\n`;
          });
          reply += `\n`;
        }
        if (recentMeeting.content) {
          const preview = recentMeeting.content.slice(0, 160);
          reply += `📝 *ট্রান্সক্রিপশন সারাংশ:* "${preview}..."\n\n`;
        }
        if (recentMeeting.original_ref) {
          reply += `📁 _মূল অডিও ফাইল সংরক্ষিত আছে: ${recentMeeting.original_ref}_`;
        }
        return reply.trim();
      }
      return '🎙️ এখনো কোনো মিটিং রেকর্ডিং বা সিদ্ধান্ত সংরক্ষিত নেই।';
    }

    // Check image / photo memory
    if (memType === 'image' || /ছবি|image|photo|screen|screenshot/i.test(q)) {
      const recentImg = db.getRecentMemory(userId, 'image');
      if (recentImg) {
        let reply = `📸 *সংরক্ষিত ছবির তথ্য (${recentImg.title || 'ছবি'}):*\n\n`;
        if (recentImg.content) {
          reply += `📝 *ছবিতে যা লেখা আছে / তথ্য:*\n${recentImg.content}\n\n`;
        }
        const data = recentImg.structured_data || {};
        if (data.visualDetails) {
          reply += `👁️ *ভিজ্যুয়াল বর্ণনা:* ${data.visualDetails}\n\n`;
        }
        if (recentImg.original_ref) {
          reply += `📁 _মূল ছবিটি সংরক্ষিত আছে: ${recentImg.original_ref}_`;
        }
        return reply.trim();
      }
      return '📸 এখনো কোনো ছবি বা ডকুমেন্টের তথ্য মেমরিতে সংরক্ষিত নেই।';
    }

    // Check general user memories / learned facts
    if (q) {
      const found = db.searchMemories(userId, q, 5);
      if (found.length > 0) {
        let reply = `🧠 *"${q}" সম্পর্কিত সংরক্ষিত স্মৃতি (${found.length}টি):*\n\n`;
        found.forEach((m, i) => {
          reply += `*${i + 1}.* [${m.memory_type.toUpperCase()}] *${m.title || 'তথ্য'}:*\n   ${m.content}\n`;
          if (m.original_ref) reply += `   _📁 রেফারেন্স: ${m.original_ref}_\n`;
        });
        return reply.trim();
      }
    }

    // Return general memories summary
    const all = db.getMemories(userId, null, 5);
    if (all.length > 0) {
      let reply = `🧠 *তোমার সাম্প্রতিক সংরক্ষিত মেমরি (${all.length}টি):*\n\n`;
      all.forEach((m, i) => {
        reply += `*${i + 1}.* [${m.memory_type}] *${m.title || 'স্মৃতি'}:* ${m.content.slice(0, 80)}...\n`;
      });
      return reply.trim();
    }

    return '🧠 এখনো কোনো বিশেষ মেমরি বা তথ্য সংরক্ষিত নেই।';
  }

  // ── 9. MEMORY FORGET (Section 5, 11) ──────────────────────────
  if (intent === 'memory_forget' || intent === 'forget_memory') {
    const target = targetRef || parameters.targetRef || '';
    if (!target) {
      return '❌ কোন তথ্য বা স্মৃতিটি আর মনে রাখবো না বলো?';
    }
    const forgotten = db.forgetMemory(userId, target);
    if (forgotten) {
      db.recordAction(userId, opId, 'delete', 'memory', null, `Forgot memory "${target}"`, null, null, 'SUCCESS');
      return `🗑️ *স্মৃতি থেকে মুছে ফেলা হয়েছে!* "${target}" সম্পর্কিত সংরক্ষিত তথ্য আর মনে রাখা হবে না।`;
    }
    return `🔍 "${target}" সম্পর্কিত কোনো সক্রিয় স্মৃতি পাওয়া যায়নি।`;
  }

  // ── 10. REMEMBER THIS (Section 5) ─────────────────────────────
  if (intent === 'remember_this' || intent === 'save_memory') {
    const content = parameters.content || targetRef || '';
    if (!content || content.length < 2) {
      const lastAction = db.getLastAction(userId);
      if (lastAction && lastAction.description) {
        const memId = db.saveMemory(userId, {
          memoryType: 'fact',
          sourceType: 'text',
          title: 'কথোপকথন থেকে',
          content: lastAction.description,
          topics: lastAction.resource_type,
        });
        return `🧠 *মনে রেখেছি!*\n\n📌 *${lastAction.description}*\n_এটি তোমার স্থায়ী মেমরিতে সংরক্ষণ করা হলো (#M${memId})।_`;
      }
      return '❌ কী মনে রাখতে চাও স্পষ্ট করে বলো!';
    }

    const memId = db.saveMemory(userId, {
      memoryType: parameters.memoryType || 'fact',
      sourceType: parameters.sourceType || 'text',
      title: parameters.title || 'গুরুত্বপূর্ণ তথ্য',
      content,
      topics: parameters.topics || '',
    });
    db.recordAction(userId, opId, 'create', 'memory', memId, `Saved memory "${content}"`, null, { id: memId, content }, 'SUCCESS');
    return `🧠 *মনে রেখেছি!*\n\n📌 *${content}*\n_এটি তোমার স্থায়ী মেমরিতে সংরক্ষণ করা হলো (#M${memId})।_`;
  }

  return null;
}

module.exports = {
  resolveTargetResource,
  executeUniversalAction,
};
