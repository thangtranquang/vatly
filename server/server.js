'use strict';
const http = require('node:http');
const path = require('node:path');
const { openDb } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'vatly12.db');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const db = openDb(DB_FILE);
const handler = createApp({
  db,
  publicDir: PUBLIC_DIR,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
});

// Remove expired sessions once an hour.
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 3600e3).unref();

const server = http.createServer(handler);
server.listen(PORT, () => console.log(`Vật lí 12 đang chạy tại http://localhost:${PORT} (CSDL: ${DB_FILE})`));

const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
