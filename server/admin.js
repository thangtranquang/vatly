'use strict';
// Admin commands, run inside the container:
//   node server/admin.js list-users
//   node server/admin.js reset-password <email>
//   node server/admin.js delete-user <email>
const crypto = require('node:crypto');
const path = require('node:path');
const { openDb } = require('./db');
const { hashPassword } = require('./auth');

const db = openDb(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'vatly12.db'));
const [cmd, arg] = process.argv.slice(2);

function needUser(email) {
  const u = email && db.prepare('SELECT id, email, name FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!u) { console.error('Không tìm thấy tài khoản: ' + email); process.exit(1); }
  return u;
}

if (cmd === 'list-users') {
  const rows = db.prepare(`SELECT u.email, u.name, datetime(u.created_at/1000,'unixepoch') AS created,
    (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id) AS attempts FROM users u ORDER BY u.id`).all();
  console.table(rows);
} else if (cmd === 'reset-password') {
  const u = needUser(arg);
  const temp = crypto.randomBytes(6).toString('base64url');
  db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(temp), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  console.log(`Mật khẩu tạm thời của ${u.email}: ${temp}\nHãy nhắc học sinh đổi mật khẩu sau khi đăng nhập.`);
} else if (cmd === 'delete-user') {
  const u = needUser(arg);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  console.log('Đã xoá tài khoản ' + u.email + ' cùng toàn bộ lịch sử làm bài.');
} else if (cmd === 'backup') {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const dir = path.dirname(process.env.DB_FILE || path.join(__dirname, '..', 'data', 'vatly12.db'));
  const out = path.join(dir, `backup-${stamp}.db`);
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  console.log('Đã sao lưu cơ sở dữ liệu vào ' + out);
} else {
  console.log('Lệnh: list-users | reset-password <email> | delete-user <email> | backup');
  process.exit(cmd ? 1 : 0);
}
