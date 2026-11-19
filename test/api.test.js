'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { signToken, verifyToken, hashPassword, verifyPassword } = require('../src/auth');

let server, base;

before(async () => {
  server = http.createServer(createApp({ db: openDb(), secret: 'test-secret-1234567890' }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function login(email) {
  await call('POST', '/auth/register', { body: { email, password: 'password123' } });
  return (await call('POST', '/auth/login', { body: { email, password: 'password123' } })).data.token;
}

test('auth helpers', () => {
  const stored = hashPassword('rahasia123');
  assert.ok(verifyPassword('rahasia123', stored));
  assert.ok(!verifyPassword('salah', stored));
  const token = signToken({ sub: 1 }, 's');
  assert.equal(verifyToken(token, 's').sub, 1);
  assert.equal(verifyToken(token, 'lain'), null);
  assert.equal(verifyToken(token + 'x', 's'), null);
  assert.equal(verifyToken(signToken({ sub: 1 }, 's', -10), 's'), null);
});

test('register: validasi dan duplikat', async () => {
  assert.equal((await call('POST', '/auth/register', { body: { email: 'bukan-email', password: 'password123' } })).status, 400);
  assert.equal((await call('POST', '/auth/register', { body: { email: 'a@b.com', password: 'pendek' } })).status, 400);
  assert.equal((await call('POST', '/auth/register', { body: { email: 'dup@b.com', password: 'password123' } })).status, 201);
  assert.equal((await call('POST', '/auth/register', { body: { email: 'DUP@b.com', password: 'password123' } })).status, 409);
});

test('login salah ditolak', async () => {
  await login('x@b.com');
  assert.equal((await call('POST', '/auth/login', { body: { email: 'x@b.com', password: 'salahsalah' } })).status, 401);
  assert.equal((await call('POST', '/auth/login', { body: { email: 'tidak@ada.com', password: 'password123' } })).status, 401);
});

test('tasks butuh token', async () => {
  assert.equal((await call('GET', '/tasks')).status, 401);
  assert.equal((await call('GET', '/tasks', { token: 'palsu' })).status, 401);
});

test('CRUD task + filter status', async () => {
  const token = await login('crud@b.com');
  const created = await call('POST', '/tasks', { token, body: { title: '  Belajar Node  ' } });
  assert.equal(created.status, 201);
  assert.equal(created.data.title, 'Belajar Node');
  assert.equal(created.data.status, 'todo');

  const id = created.data.id;
  const patched = await call('PATCH', `/tasks/${id}`, { token, body: { status: 'done' } });
  assert.equal(patched.data.status, 'done');
  assert.equal(patched.data.title, 'Belajar Node');

  assert.equal((await call('PATCH', `/tasks/${id}`, { token, body: { status: 'selesai' } })).status, 400);
  assert.equal((await call('POST', '/tasks', { token, body: { title: '' } })).status, 400);

  assert.equal((await call('GET', '/tasks?status=done', { token })).data.length, 1);
  assert.equal((await call('GET', '/tasks?status=todo', { token })).data.length, 0);
  assert.equal((await call('GET', '/tasks?status=zzz', { token })).status, 400);

  assert.equal((await call('DELETE', `/tasks/${id}`, { token })).status, 204);
  assert.equal((await call('GET', `/tasks/${id}`, { token })).status, 404);
});

test('user tidak bisa mengakses task user lain', async () => {
  const a = await login('a@iso.com');
  const b = await login('b@iso.com');
  const { data } = await call('POST', '/tasks', { token: a, body: { title: 'Rahasia A' } });
  assert.equal((await call('GET', `/tasks/${data.id}`, { token: b })).status, 404);
  assert.equal((await call('DELETE', `/tasks/${data.id}`, { token: b })).status, 404);
  assert.equal((await call('GET', '/tasks', { token: b })).data.length, 0);
});

test('JSON rusak dan route tidak ada', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', body: '{rusak' });
  assert.equal(res.status, 400);
  assert.equal((await call('GET', '/nope')).status, 404);
});
