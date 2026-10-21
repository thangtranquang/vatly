'use strict';
// Password hashing (scrypt) and opaque session tokens. Only a SHA-256 of each token is stored.
const crypto = require('node:crypto');

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(actual, expected);
}

// A fixed hash used to keep login timing similar when the email does not exist.
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, userId, now = Date.now()) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, now, now + SESSION_DAYS * 864e5);
  return token;
}

function userForToken(db, token, now = Date.now()) {
  if (!token) return null;
  const row = db.prepare(
    'SELECT u.id, u.email, u.name, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?'
  ).get(sha256(token));
  if (!row) return null;
  if (row.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return null;
  }
  return { id: row.id, email: row.email, name: row.name };
}

function deleteSession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

module.exports = { hashPassword, verifyPassword, DUMMY_HASH, createSession, userForToken, deleteSession, SESSION_DAYS };
