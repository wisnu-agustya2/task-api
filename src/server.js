'use strict';
const http = require('node:http');
const { openDb } = require('./db');
const { createApp } = require('./app');

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 16) {
  console.error('Set JWT_SECRET (minimal 16 karakter). Contoh: JWT_SECRET=$(openssl rand -hex 32) npm start');
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || 'tasks.db');
const port = Number(process.env.PORT) || 3000;
http.createServer(createApp({ db, secret })).listen(port, () => {
  console.log(`task-api berjalan di http://localhost:${port}`);
});
