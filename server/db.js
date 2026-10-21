'use strict';
// SQLite storage using Node's built-in driver (no native dependencies).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref TEXT NOT NULL,
  title TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  score REAL,
  max REAL,
  duration_s INTEGER
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, started_at);
CREATE TABLE IF NOT EXISTS answers (
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  qid TEXT NOT NULL,
  ls TEXT NOT NULL,
  type TEXT NOT NULL,
  answer TEXT NOT NULL,
  correct INTEGER NOT NULL,
  points REAL NOT NULL,
  max_points REAL NOT NULL,
  answered_at INTEGER NOT NULL,
  PRIMARY KEY (attempt_id, qid)
);
`;

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
