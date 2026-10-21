'use strict';
// HTTP request handling: static files + JSON API. No external dependencies.
const fs = require('node:fs');
const path = require('node:path');
const { hashPassword, verifyPassword, DUMMY_HASH, createSession, userForToken, deleteSession, SESSION_DAYS } = require('./auth');

const KINDS = new Set(['lesson', 'practice', 'test', 'exam', 'review']);
const TYPES = new Set(['mc', 'ds', 'sa']);
const ID_RE = /^[A-Za-z0-9._-]{1,40}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const MAX_BODY = 256 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function createRateLimiter(limit, windowMs) {
  const hits = new Map();
  return {
    hit(key, now = Date.now()) {
      let e = hits.get(key);
      if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
      e.count += 1;
      if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      return e.count <= limit;
    },
    reset(key) { hits.delete(key); },
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.startsWith('application/json')) return reject(new HttpError(415, 'Cần gửi dữ liệu dạng JSON.'));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Dữ liệu quá lớn.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new HttpError(400, 'JSON không hợp lệ.')); } });
    req.on('error', reject);
  });
}

const str = (v, max, field) => {
  if (typeof v !== 'string') throw new HttpError(400, `Thiếu ${field}.`);
  const s = v.trim();
  if (!s || s.length > max) throw new HttpError(400, `${field} không hợp lệ.`);
  return s;
};
const num = (v, min, max, field) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new HttpError(400, `${field} không hợp lệ.`);
  return v;
};

function validateAnswer(a) {
  if (!a || typeof a !== 'object') throw new HttpError(400, 'Câu trả lời không hợp lệ.');
  const qid = str(a.qid, 40, 'qid');
  const ls = str(a.ls, 40, 'ls');
  if (!ID_RE.test(qid) || !ID_RE.test(ls)) throw new HttpError(400, 'Mã câu hỏi không hợp lệ.');
  if (!TYPES.has(a.type)) throw new HttpError(400, 'Loại câu hỏi không hợp lệ.');
  const answer = JSON.stringify(a.answer === undefined ? null : a.answer);
  if (answer.length > 500) throw new HttpError(400, 'Câu trả lời quá dài.');
  if (typeof a.correct !== 'boolean') throw new HttpError(400, 'Thiếu kết quả đúng/sai.');
  const maxPoints = num(a.max, 0, 10, 'Điểm tối đa');
  const points = num(a.points, 0, maxPoints, 'Điểm');
  return { qid, ls, type: a.type, answer, correct: a.correct ? 1 : 0, points, maxPoints };
}

function createApp({ db, publicDir, cookieSecure = false, trustProxy = false, now = () => Date.now() }) {
  const authLimiter = createRateLimiter(20, 15 * 60e3);
  const emailLimiter = createRateLimiter(10, 15 * 60e3);
  const indexFile = path.join(publicDir, 'index.html');

  const clientIp = (req) => (trustProxy && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';

  function send(res, status, body, headers = {}) {
    const data = body === undefined ? '' : JSON.stringify(body);
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(data);
  }
  const sessionCookie = (token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cookieSecure ? '; Secure' : ''}`;

  function requireUser(req) {
    const user = userForToken(db, parseCookies(req.headers.cookie).sid, now());
    if (!user) throw new HttpError(401, 'Bạn cần đăng nhập.');
    return user;
  }
  function checkOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return; // same-origin fetches from older browsers, curl, tests
    let host;
    try { host = new URL(origin).host; } catch { throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.'); }
    const expected = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
    if (host !== expected) throw new HttpError(403, 'Nguồn yêu cầu không hợp lệ.');
  }
  function ownAttempt(user, id) {
    const a = db.prepare('SELECT * FROM attempts WHERE id = ? AND user_id = ?').get(id, user.id);
    if (!a) throw new HttpError(404, 'Không tìm thấy lượt làm bài.');
    return a;
  }

  const routes = {
    'POST /api/register': async (req, res) => {
      const ip = clientIp(req);
      if (!authLimiter.hit('reg:' + ip, now())) throw new HttpError(429, 'Bạn thử quá nhiều lần. Hãy đợi 15 phút.');
      const b = await readJson(req);
      const email = str(b.email, 254, 'Email').toLowerCase();
      if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email không hợp lệ.');
      const name = str(b.name, 80, 'Họ tên');
      if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 128) throw new HttpError(400, 'Mật khẩu cần từ 8 đến 128 kí tự.');
      if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Email này đã được đăng ký.');
      const r = db.prepare('INSERT INTO users (email, name, pass_hash, created_at) VALUES (?, ?, ?, ?)').run(email, name, hashPassword(b.password), now());
      const token = createSession(db, Number(r.lastInsertRowid), now());
      send(res, 201, { user: { id: Number(r.lastInsertRowid), email, name } }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
    },
    'POST /api/login': async (req, res) => {
      const ip = clientIp(req);
      const b = await readJson(req);
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
      if (!authLimiter.hit('login:' + ip, now()) || !emailLimiter.hit('email:' + email, now())) throw new HttpError(429, 'Bạn thử quá nhiều lần. Hãy đợi 15 phút.');
      const password = typeof b.password === 'string' ? b.password : '';
      const u = email ? db.prepare('SELECT id, email, name, pass_hash FROM users WHERE email = ?').get(email) : null;
      const ok = verifyPassword(password, u ? u.pass_hash : DUMMY_HASH) && !!u;
      if (!ok) throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
      emailLimiter.reset('email:' + email);
      const token = createSession(db, u.id, now());
      send(res, 200, { user: { id: u.id, email: u.email, name: u.name } }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) });
    },
    'POST /api/logout': async (req, res) => {
      deleteSession(db, parseCookies(req.headers.cookie).sid);
      send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    },
    'GET /api/me': async (req, res) => send(res, 200, { user: requireUser(req) }),
    'POST /api/me/password': async (req, res) => {
      const user = requireUser(req);
      const b = await readJson(req);
      const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(user.id);
      if (typeof b.oldPassword !== 'string' || !verifyPassword(b.oldPassword, row.pass_hash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng.');
      if (typeof b.newPassword !== 'string' || b.newPassword.length < 8 || b.newPassword.length > 128) throw new HttpError(400, 'Mật khẩu mới cần từ 8 đến 128 kí tự.');
      db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(hashPassword(b.newPassword), user.id);
      const keep = parseCookies(req.headers.cookie).sid;
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(user.id, require('node:crypto').createHash('sha256').update(keep).digest('hex'));
      send(res, 200, { ok: true });
    },
    'GET /api/me/summary': async (req, res) => {
      const user = requireUser(req);
      const best = {};
      for (const r of db.prepare('SELECT ref, score, max FROM attempts WHERE user_id = ? AND finished_at IS NOT NULL AND max > 0').all(user.id)) {
        const cur = best[r.ref];
        if (!cur || r.score / r.max > cur.score / cur.max) best[r.ref] = { score: r.score, max: r.max };
      }
      const lessons = {};
      const latest = new Map();
      for (const r of db.prepare('SELECT a.qid, a.ls, a.correct, a.points, a.max_points FROM answers a JOIN attempts t ON t.id = a.attempt_id WHERE t.user_id = ? ORDER BY a.answered_at, a.rowid').all(user.id)) {
        const l = lessons[r.ls] || (lessons[r.ls] = { answered: 0, correct: 0, points: 0, max: 0 });
        l.answered += 1; l.correct += r.correct; l.points += r.points; l.max += r.max_points;
        latest.set(r.qid, r.correct);
      }
      const totals = db.prepare('SELECT COUNT(*) AS attempts, SUM(CASE WHEN finished_at IS NOT NULL THEN 1 ELSE 0 END) AS finished FROM attempts WHERE user_id = ?').get(user.id);
      let wrongNow = 0; for (const c of latest.values()) if (!c) wrongNow += 1;
      send(res, 200, { best, lessons, totals: { attempts: totals.attempts, finished: totals.finished || 0, questions: latest.size, wrongNow } });
    },
    'GET /api/attempts': async (req, res, url) => {
      const user = requireUser(req);
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
      const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
      const rows = db.prepare(`SELECT t.id, t.kind, t.ref, t.title, t.started_at, t.finished_at, t.score, t.max, t.duration_s,
        (SELECT COUNT(*) FROM answers a WHERE a.attempt_id = t.id) AS answered,
        (SELECT COALESCE(SUM(1 - a.correct), 0) FROM answers a WHERE a.attempt_id = t.id) AS wrong
        FROM attempts t WHERE t.user_id = ? ORDER BY t.started_at DESC, t.id DESC LIMIT ? OFFSET ?`).all(user.id, limit, offset);
      const total = db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ?').get(user.id).n;
      send(res, 200, { attempts: rows, total });
    },
    'POST /api/attempts': async (req, res) => {
      const user = requireUser(req);
      const b = await readJson(req);
      if (!KINDS.has(b.kind)) throw new HttpError(400, 'Loại bài không hợp lệ.');
      const ref = str(b.ref, 40, 'ref');
      if (!ID_RE.test(ref)) throw new HttpError(400, 'Mã bài không hợp lệ.');
      const title = str(b.title, 160, 'Tiêu đề');
      const open = db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id = ? AND started_at > ?').get(user.id, now() - 3600e3).n;
      if (open > 300) throw new HttpError(429, 'Bạn tạo quá nhiều lượt làm bài trong một giờ.');
      const r = db.prepare('INSERT INTO attempts (user_id, kind, ref, title, started_at) VALUES (?, ?, ?, ?, ?)').run(user.id, b.kind, ref, title, now());
      send(res, 201, { id: Number(r.lastInsertRowid) });
    },
    'GET /api/attempts/:id': async (req, res, url, id) => {
      const user = requireUser(req);
      const a = ownAttempt(user, id);
      const answers = db.prepare('SELECT qid, ls, type, answer, correct, points, max_points FROM answers WHERE attempt_id = ? ORDER BY answered_at, rowid').all(a.id)
        .map((r) => ({ qid: r.qid, ls: r.ls, type: r.type, answer: JSON.parse(r.answer), correct: !!r.correct, points: r.points, max: r.max_points }));
      delete a.user_id;
      send(res, 200, { attempt: a, answers });
    },
    'POST /api/attempts/:id/answers': async (req, res, url, id) => {
      const user = requireUser(req);
      const a = ownAttempt(user, id);
      if (a.finished_at) throw new HttpError(409, 'Lượt làm bài đã kết thúc.');
      const b = await readJson(req);
      if (!Array.isArray(b.answers) || b.answers.length < 1 || b.answers.length > 100) throw new HttpError(400, 'Danh sách câu trả lời không hợp lệ.');
      const list = b.answers.map(validateAnswer);
      const count = db.prepare('SELECT COUNT(*) AS n FROM answers WHERE attempt_id = ?').get(a.id).n;
      if (count + list.length > 200) throw new HttpError(400, 'Lượt làm bài có quá nhiều câu.');
      const ins = db.prepare('INSERT OR REPLACE INTO answers (attempt_id, qid, ls, type, answer, correct, points, max_points, answered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
      const t = now();
      db.exec('BEGIN');
      try { list.forEach((x, i) => ins.run(a.id, x.qid, x.ls, x.type, x.answer, x.correct, x.points, x.maxPoints, t + i)); db.exec('COMMIT'); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      send(res, 200, { saved: list.length });
    },
    'POST /api/attempts/:id/finish': async (req, res, url, id) => {
      const user = requireUser(req);
      const a = ownAttempt(user, id);
      if (a.finished_at) throw new HttpError(409, 'Lượt làm bài đã kết thúc.');
      const b = await readJson(req);
      const max = num(b.max, 0, 1000, 'Điểm tối đa');
      const score = num(b.score, 0, max, 'Điểm');
      const duration = b.duration === undefined ? null : Math.round(num(b.duration, 0, 86400, 'Thời gian'));
      db.prepare('UPDATE attempts SET finished_at = ?, score = ?, max = ?, duration_s = ? WHERE id = ?').run(now(), score, max, duration, a.id);
      send(res, 200, { ok: true });
    },
    'GET /api/wrong': async (req, res) => {
      const user = requireUser(req);
      const latest = new Map();
      for (const r of db.prepare('SELECT a.qid, a.ls, a.correct, a.answered_at FROM answers a JOIN attempts t ON t.id = a.attempt_id WHERE t.user_id = ? ORDER BY a.answered_at, a.rowid').all(user.id)) {
        const e = latest.get(r.qid) || { qid: r.qid, ls: r.ls, wrongCount: 0, tries: 0 };
        e.tries += 1; if (!r.correct) e.wrongCount += 1;
        e.lastCorrect = !!r.correct; e.lastAt = r.answered_at;
        latest.set(r.qid, e);
      }
      const wrong = [...latest.values()].filter((e) => !e.lastCorrect).sort((x, y) => y.wrongCount - x.wrongCount || y.lastAt - x.lastAt);
      send(res, 200, { wrong });
    },
    'GET /healthz': async (req, res) => send(res, 200, { ok: true }),
  };

  function match(method, pathname) {
    const exact = routes[`${method} ${pathname}`];
    if (exact) return [exact];
    const m = pathname.match(/^\/api\/attempts\/(\d{1,12})(\/answers|\/finish)?$/);
    if (m) {
      const h = routes[`${method} /api/attempts/:id${m[2] || ''}`];
      if (h) return [h, Number(m[1])];
    }
    return null;
  }

  function serveStatic(req, res, pathname) {
    let file = pathname === '/' ? indexFile : path.join(publicDir, path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, ''));
    if (!file.startsWith(publicDir)) { res.writeHead(403, SECURITY_HEADERS); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy trang.'); }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }

  return async function handler(req, res) {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
    const found = match(req.method, url.pathname);
    if (!found) {
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Không có API này.' });
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY_HEADERS); return res.end(); }
      return serveStatic(req, res, url.pathname);
    }
    try {
      if (req.method !== 'GET') checkOrigin(req);
      await found[0](req, res, url, found[1]);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: 'Lỗi máy chủ, hãy thử lại.' });
    }
  };
}

module.exports = { createApp, createRateLimiter, HttpError };
