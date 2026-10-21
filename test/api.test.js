'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../server/db');
const { createApp } = require('../server/app');
const { hashPassword, verifyPassword } = require('../server/auth');

function startServer(opts = {}) {
  const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl12-pub-'));
  fs.writeFileSync(path.join(publicDir, 'index.html'), '<!doctype html><title>t</title>');
  const db = openDb(':memory:');
  const server = http.createServer(createApp({ db, publicDir, ...opts }));
  return new Promise((resolve) => server.listen(0, () => resolve({ server, db, base: `http://127.0.0.1:${server.address().port}` })));
}

// Minimal client that keeps the session cookie like a browser would.
function client(base) {
  let cookie = '';
  return async function call(method, url, body, headers = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].replace(/^sid=$/, '');
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };
}

const ans = (qid, correct, extra = {}) => ({ qid, ls: 'c1-1', type: 'mc', answer: { pick: 1 }, correct, points: correct ? 0.25 : 0, max: 0.25, ...extra });

test('password hashing verifies only the right password', () => {
  const h = hashPassword('mat-khau-dai');
  assert.ok(verifyPassword('mat-khau-dai', h));
  assert.ok(!verifyPassword('mat-khau-sai', h));
  assert.ok(!verifyPassword('x', 'not-a-hash'));
});

test('register, read profile, logout, login again', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  let r = await c('POST', '/api/register', { email: ' An@Example.com ', name: 'Nguyễn An', password: 'matkhau123' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'an@example.com');
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  r = await c('GET', '/api/me');
  assert.equal(r.status, 200);
  assert.equal(r.body.user.name, 'Nguyễn An');
  r = await c('POST', '/api/logout', {});
  assert.equal(r.status, 200);
  r = await c('GET', '/api/me');
  assert.equal(r.status, 401);
  r = await c('POST', '/api/login', { email: 'an@example.com', password: 'sai-mat-khau' });
  assert.equal(r.status, 401);
  r = await c('POST', '/api/login', { email: 'AN@example.com', password: 'matkhau123' });
  assert.equal(r.status, 200);
  assert.equal((await c('GET', '/api/me')).status, 200);
});

test('register rejects bad input and duplicate email', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  assert.equal((await c('POST', '/api/register', { email: 'khong-phai-email', name: 'A', password: 'matkhau123' })).status, 400);
  assert.equal((await c('POST', '/api/register', { email: 'a@b.vn', name: 'A', password: 'ngan' })).status, 400);
  assert.equal((await c('POST', '/api/register', { email: 'a@b.vn', name: '', password: 'matkhau123' })).status, 400);
  assert.equal((await c('POST', '/api/register', { email: 'a@b.vn', name: 'A', password: 'matkhau123' })).status, 201);
  const r = await client(base)('POST', '/api/register', { email: 'A@B.VN', name: 'B', password: 'matkhau123' });
  assert.equal(r.status, 409);
});

test('API needs login and JSON, and rejects foreign origins', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  assert.equal((await c('GET', '/api/attempts')).status, 401);
  assert.equal((await c('GET', '/api/wrong')).status, 401);
  const plain = await fetch(base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
  assert.equal(plain.status, 415);
  const foreign = await c('POST', '/api/login', { email: 'a@b.vn', password: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(foreign.status, 403);
});

test('attempt lifecycle: create, save answers, finish, list, detail, summary', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  await c('POST', '/api/register', { email: 'hs@truong.vn', name: 'Học sinh', password: 'matkhau123' });
  let r = await c('POST', '/api/attempts', { kind: 'lesson', ref: 'c1-1', title: 'Bài 1.1' });
  assert.equal(r.status, 201);
  const id = r.body.id;
  r = await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('c1-1.1', true), ans('c1-1.2', false)] });
  assert.equal(r.status, 200);
  r = await c('POST', `/api/attempts/${id}/answers`, { answers: [{ qid: 'c1-1.4', ls: 'c1-1', type: 'ds', answer: { picks: [true, false, true, null] }, correct: false, points: 0.25, max: 1 }] });
  assert.equal(r.status, 200);
  r = await c('POST', `/api/attempts/${id}/finish`, { score: 0.5, max: 2, duration: 75 });
  assert.equal(r.status, 200);
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('c1-1.3', true)] })).status, 409);
  r = await c('GET', '/api/attempts');
  assert.equal(r.body.total, 1);
  assert.equal(r.body.attempts[0].answered, 3);
  assert.equal(r.body.attempts[0].wrong, 2);
  r = await c('GET', `/api/attempts/${id}`);
  assert.equal(r.body.attempt.score, 0.5);
  assert.deepEqual(r.body.answers[2].answer, { picks: [true, false, true, null] });
  r = await c('GET', '/api/me/summary');
  assert.deepEqual(r.body.best['c1-1'], { score: 0.5, max: 2 });
  assert.equal(r.body.lessons['c1-1'].answered, 3);
  assert.equal(r.body.totals.wrongNow, 2);
});

test('wrong list keeps only questions whose latest answer is wrong', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  await c('POST', '/api/register', { email: 'hs2@truong.vn', name: 'HS', password: 'matkhau123' });
  const a1 = (await c('POST', '/api/attempts', { kind: 'lesson', ref: 'c1-1', title: 'Bài 1.1' })).body.id;
  await c('POST', `/api/attempts/${a1}/answers`, { answers: [ans('q.1', false), ans('q.2', false), ans('q.3', true)] });
  const a2 = (await c('POST', '/api/attempts', { kind: 'review', ref: 'wrong', title: 'Ôn câu sai' })).body.id;
  await c('POST', `/api/attempts/${a2}/answers`, { answers: [ans('q.1', true), ans('q.2', false), ans('q.3', false)] });
  const r = await c('GET', '/api/wrong');
  assert.deepEqual(r.body.wrong.map((w) => w.qid).sort(), ['q.2', 'q.3']);
  assert.equal(r.body.wrong.find((w) => w.qid === 'q.2').wrongCount, 2);
});

test('students cannot see or modify each other\'s attempts', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const a = client(base), b = client(base);
  await a('POST', '/api/register', { email: 'a@x.vn', name: 'A', password: 'matkhau123' });
  await b('POST', '/api/register', { email: 'b@x.vn', name: 'B', password: 'matkhau123' });
  const id = (await a('POST', '/api/attempts', { kind: 'exam', ref: 'exam-1', title: 'Đề 1' })).body.id;
  assert.equal((await b('GET', `/api/attempts/${id}`)).status, 404);
  assert.equal((await b('POST', `/api/attempts/${id}/answers`, { answers: [ans('x.1', true)] })).status, 404);
  assert.equal((await b('POST', `/api/attempts/${id}/finish`, { score: 10, max: 10 })).status, 404);
  assert.equal((await b('GET', '/api/attempts')).body.total, 0);
});

test('attempt input validation', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  await c('POST', '/api/register', { email: 'v@x.vn', name: 'V', password: 'matkhau123' });
  assert.equal((await c('POST', '/api/attempts', { kind: 'hack', ref: 'c1-1', title: 'x' })).status, 400);
  assert.equal((await c('POST', '/api/attempts', { kind: 'lesson', ref: '../etc', title: 'x' })).status, 400);
  const id = (await c('POST', '/api/attempts', { kind: 'lesson', ref: 'c1-1', title: 'x' })).body.id;
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [] })).status, 400);
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('q 1', true)] })).status, 400);
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('q.1', true, { points: 5 })] })).status, 400);
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('q.1', true, { type: 'essay' })] })).status, 400);
  assert.equal((await c('POST', `/api/attempts/${id}/answers`, { answers: [ans('q.1', true, { answer: 'x'.repeat(600) })] })).status, 400);
  assert.equal((await c('POST', `/api/attempts/${id}/finish`, { score: 3, max: 2 })).status, 400);
});

test('change password keeps current session and rejects wrong old password', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base), other = client(base);
  await c('POST', '/api/register', { email: 'p@x.vn', name: 'P', password: 'matkhau123' });
  await other('POST', '/api/login', { email: 'p@x.vn', password: 'matkhau123' });
  assert.equal((await c('POST', '/api/me/password', { oldPassword: 'sai', newPassword: 'matkhaumoi1' })).status, 400);
  assert.equal((await c('POST', '/api/me/password', { oldPassword: 'matkhau123', newPassword: 'matkhaumoi1' })).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 200);
  assert.equal((await other('GET', '/api/me')).status, 401, 'other sessions are signed out');
  assert.equal((await client(base)('POST', '/api/login', { email: 'p@x.vn', password: 'matkhaumoi1' })).status, 200);
});

test('login is rate limited per email', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  const c = client(base);
  let last;
  for (let i = 0; i < 11; i++) last = await c('POST', '/api/login', { email: 'nobody@x.vn', password: 'sai-mat-khau' });
  assert.equal(last.status, 429);
});

test('static files are served with security headers and no path traversal', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());
  let r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  r = await fetch(base + '/..%2f..%2fpackage.json');
  assert.ok([403, 404].includes(r.status));
  r = await fetch(base + '/healthz');
  assert.equal(r.status, 200);
});
