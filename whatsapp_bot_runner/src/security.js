/**
 * Cryptographic & Security Utilities — FREND Multi-User System
 *
 * Implements:
 * 1. Password hashing with scrypt (cryptographic salt + timing-safe comparison)
 * 2. Symmetric encryption/decryption with AES-256-GCM for OAuth tokens
 * 3. Cryptographically secure single-use random tokens
 * 4. Password policy validation
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── 1. Encryption Master Key Management ──────────────────────
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const keyFile = path.join(dataDir, '.secret_encryption_key');

function getMasterEncryptionKey() {
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length >= 32) {
    return crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
  }
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile);
  }
  const newKey = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, newKey, { mode: 0o600 });
  return newKey;
}

const MASTER_KEY = getMasterEncryptionKey();

// ─── 2. Password Hashing (scrypt) ─────────────────────────────
/**
 * Hashes password using Node.js crypto.scryptSync with 16-byte random salt.
 * Format: scrypt:<saltHex>:<keyHex>
 */
function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`;
}

/**
 * Verifies a password against a stored hash.
 * Supports legacy plaintext migration safely during verification.
 */
function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;

  // scrypt format
  if (storedHash.startsWith('scrypt:')) {
    const parts = storedHash.split(':');
    if (parts.length !== 3) return false;
    const salt = Buffer.from(parts[1], 'hex');
    const expectedKey = Buffer.from(parts[2], 'hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    if (derivedKey.length !== expectedKey.length) return false;
    return crypto.timingSafeEqual(derivedKey, expectedKey);
  }

  // Fallback for legacy passwords (plain string)
  if (password === storedHash) {
    return true;
  }

  return false;
}

/**
 * Validates password strength policy
 */
function validatePasswordPolicy(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'পাসওয়ার্ড পূরণ করা আবশ্যক।' };
  }
  if (password.length < 3) {
    return { valid: false, message: 'পাসওয়ার্ড কমপক্ষে ৩ অক্ষরের হতে হবে।' };
  }
  return { valid: true };
}

// ─── 3. AES-256-GCM Symmetric Encryption (For OAuth Tokens) ───
/**
 * Encrypts an object or string using AES-256-GCM.
 * Returns { cipherText, iv, authTag } (all hex strings).
 */
function encryptData(data) {
  const text = typeof data === 'object' ? JSON.stringify(data) : String(data);
  const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    cipherText: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypts an AES-256-GCM payload.
 */
function decryptData({ cipherText, iv, authTag }, parseJson = true) {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));

    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    if (parseJson) {
      try {
        return JSON.parse(decrypted);
      } catch (_) {
        return decrypted;
      }
    }
    return decrypted;
  } catch (err) {
    throw new Error(`Decryption failed: ${err.message}`);
  }
}

// ─── 4. Secure Random Tokens (Single-use OAuth State & Links) ─
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// ─── 5. Secret Scrubbing for Logs & Diagnostics ───────────────
function scrubSecrets(input) {
  if (!input) return input;
  let text = typeof input === 'object' ? JSON.stringify(input) : String(input);
  
  // Hashes
  text = text.replace(/scrypt:[a-f0-9:]+/gi, 'scrypt:[REDACTED_HASH]');
  text = text.replace(/[a-f0-9]{32,}:[a-f0-9]{16,}/gi, '[REDACTED_HASH]');
  
  // Passwords
  text = text.replace(/(["']?password["']?\s*[:=]\s*["'])([^"']+)(["'])/gi, '$1••••••••$3');
  text = text.replace(/(?:(?:user\s+)?password\s+(?:is|=|:)\s*|my\s*password\s*is\s*|পাসওয়ার্ড\s*(?:হলো|হচ্ছে|=|:|is)\s*|pass[:=]\s*)(\S+)/gi, 'password is [REDACTED_PASSWORD]');
  text = text.replace(/(?:(?:password|পাসওয়ার্ড)\s*(?:change|পরিবর্তন|চেঞ্জ)[:\s]+)(\S+)(?:\s*[|:,]\s*)(\S+)/gi, 'password change: [REDACTED_OLD] | [REDACTED_NEW]');
  
  // Tokens & Keys
  text = text.replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{15,}/gi, '$1[REDACTED_TOKEN]');
  text = text.replace(/(?:token\s+|jwt\s+)([A-Za-z0-9_\-\.]{15,})/gi, 'token [REDACTED_TOKEN]');
  text = text.replace(/eyJ[A-Za-z0-9_\-]{8,}\.?[A-Za-z0-9_\-]*/gi, '[REDACTED_TOKEN]');
  text = text.replace(/(key=[A-Za-z0-9_\-]{20,})/gi, 'key=[REDACTED_KEY]');
  
  return text;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  encryptData,
  decryptData,
  generateSecureToken,
  scrubSecrets,
};
