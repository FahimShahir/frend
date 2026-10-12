/**
 * Location-based Reminder Module
 * ব্যবহারকারী নির্দিষ্ট জায়গায় পৌঁছালে রিমাইন্ডার ট্রিগার করে।
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'frend.db'));

// Location reminders table
db.exec(`
  CREATE TABLE IF NOT EXISTS location_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    place_name TEXT NOT NULL,
    reminder_text TEXT NOT NULL,
    lat REAL,
    lng REAL,
    radius_meters INTEGER DEFAULT 300,
    is_triggered INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

/**
 * লোকেশন রিমাইন্ডার সেভ করে
 */
function saveLocationReminder(userId, placeName, reminderText) {
  return db.prepare(
    'INSERT INTO location_reminders (user_id, place_name, reminder_text) VALUES (?, ?, ?)'
  ).run(userId, placeName, reminderText).lastInsertRowid;
}

/**
 * ইউজারের লোকেশন রিমাইন্ডার আপডেট করে (lat/lng দিয়ে)
 */
function updateLocationCoords(id, lat, lng) {
  db.prepare('UPDATE location_reminders SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, id);
}

/**
 * ব্যবহারকারীর সব লোকেশন রিমাইন্ডার দেখায়
 */
function getLocationReminders(userId) {
  return db.prepare(
    'SELECT * FROM location_reminders WHERE user_id = ? AND is_triggered = 0'
  ).all(userId);
}

/**
 * ব্যবহারকারী লোকেশন পাঠালে ম্যাচ করে
 */
function checkLocationTrigger(userId, userLat, userLng) {
  const reminders = db.prepare(
    'SELECT * FROM location_reminders WHERE user_id = ? AND is_triggered = 0 AND lat IS NOT NULL'
  ).all(userId);

  const triggered = [];
  for (const reminder of reminders) {
    const dist = haversineDistance(userLat, userLng, reminder.lat, reminder.lng);
    if (dist <= reminder.radius_meters) {
      db.prepare('UPDATE location_reminders SET is_triggered = 1 WHERE id = ?').run(reminder.id);
      triggered.push(reminder);
    }
  }
  return triggered;
}

/**
 * নাম দিয়ে ম্যাচ করে (lat/lng না থাকলে)
 */
function checkPlaceNameTrigger(userId, sharedPlaceName) {
  if (!sharedPlaceName) return [];
  const reminders = db.prepare(
    'SELECT * FROM location_reminders WHERE user_id = ? AND is_triggered = 0'
  ).all(userId);

  const triggered = [];
  for (const reminder of reminders) {
    // Fuzzy match: place name includes keyword
    const pName = sharedPlaceName.toLowerCase();
    const rName = reminder.place_name.toLowerCase();
    if (pName.includes(rName) || rName.includes(pName) || similar(pName, rName)) {
      db.prepare('UPDATE location_reminders SET is_triggered = 1 WHERE id = ?').run(reminder.id);
      triggered.push(reminder);
    }
  }
  return triggered;
}

function deleteLocationReminder(userId, id) {
  return db.prepare(
    'DELETE FROM location_reminders WHERE id = ? AND user_id = ?'
  ).run(id, userId).changes > 0;
}

// Haversine distance formula (meters)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Simple string similarity check
function similar(a, b) {
  const words = a.split(/\s+/);
  return words.some(w => w.length > 2 && b.includes(w));
}

module.exports = {
  saveLocationReminder, updateLocationCoords,
  getLocationReminders, checkLocationTrigger,
  checkPlaceNameTrigger, deleteLocationReminder,
};
