'use strict';
const { hashPassword, verifyPassword, signToken, verifyToken } = require('./auth');

const STATUSES = ['todo', 'doing', 'done'];
const MAX_BODY = 100 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Body terlalu besar'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new HttpError(400, 'JSON tidak valid'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function createApp({ db, secret }) {
  if (!secret) throw new Error('secret wajib diisi');

  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (email, password) VALUES (?, ?)'),
    list: db.prepare('SELECT id, title, status, created_at FROM tasks WHERE user_id = ? ORDER BY id'),
    listByStatus: db.prepare('SELECT id, title, status, created_at FROM tasks WHERE user_id = ? AND status = ? ORDER BY id'),
    get: db.prepare('SELECT id, title, status, created_at FROM tasks WHERE id = ? AND user_id = ?'),
    insertTask: db.prepare('INSERT INTO tasks (user_id, title) VALUES (?, ?)'),
    update: db.prepare('UPDATE tasks SET title = ?, status = ? WHERE id = ? AND user_id = ?'),
    remove: db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?'),
  };

  function authenticate(req) {
    const header = req.headers.authorization || '';
    const payload = header.startsWith('Bearer ') ? verifyToken(header.slice(7), secret) : null;
    if (!payload) throw new HttpError(401, 'Token tidak valid atau kedaluwarsa');
    return payload.sub;
  }

  function validateCredentials(body) {
    const { email, password } = body;
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email tidak valid');
    if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password minimal 8 karakter');
    return { email: email.toLowerCase(), password };
  }

  function validateTitle(title) {
    if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new HttpError(400, 'Judul wajib diisi (maks 200 karakter)');
    return title.trim();
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const method = req.method;

    if (method === 'GET' && path === '/health') return send(res, 200, { status: 'ok' });

    if (method === 'POST' && path === '/auth/register') {
      const { email, password } = validateCredentials(await readJson(req));
      if (q.userByEmail.get(email)) throw new HttpError(409, 'Email sudah terdaftar');
      const { lastInsertRowid } = q.insertUser.run(email, hashPassword(password));
      return send(res, 201, { id: Number(lastInsertRowid), email });
    }

    if (method === 'POST' && path === '/auth/login') {
      const body = await readJson(req);
      const user = typeof body.email === 'string' ? q.userByEmail.get(body.email.toLowerCase()) : null;
      if (!user || typeof body.password !== 'string' || !verifyPassword(body.password, user.password)) {
        throw new HttpError(401, 'Email atau password salah');
      }
      return send(res, 200, { token: signToken({ sub: user.id }, secret) });
    }

    if (path === '/tasks' || path.startsWith('/tasks/')) {
      const userId = authenticate(req);

      if (path === '/tasks' && method === 'GET') {
        const status = url.searchParams.get('status');
        if (status && !STATUSES.includes(status)) throw new HttpError(400, 'Status tidak valid');
        return send(res, 200, status ? q.listByStatus.all(userId, status) : q.list.all(userId));
      }

      if (path === '/tasks' && method === 'POST') {
        const title = validateTitle((await readJson(req)).title);
        const { lastInsertRowid } = q.insertTask.run(userId, title);
        return send(res, 201, q.get.get(lastInsertRowid, userId));
      }

      const match = path.match(/^\/tasks\/(\d+)$/);
      if (match) {
        const id = Number(match[1]);
        const task = q.get.get(id, userId);
        if (!task) throw new HttpError(404, 'Task tidak ditemukan');

        if (method === 'GET') return send(res, 200, task);

        if (method === 'PATCH') {
          const body = await readJson(req);
          const title = body.title === undefined ? task.title : validateTitle(body.title);
          const status = body.status === undefined ? task.status : body.status;
          if (!STATUSES.includes(status)) throw new HttpError(400, 'Status tidak valid');
          q.update.run(title, status, id, userId);
          return send(res, 200, q.get.get(id, userId));
        }

        if (method === 'DELETE') {
          q.remove.run(id, userId);
          return send(res, 204);
        }
      }
    }

    throw new HttpError(404, 'Route tidak ditemukan');
  }

  return (req, res) => {
    route(req, res).catch((err) => {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Terjadi kesalahan server' });
    });
  };
}

module.exports = { createApp };
