const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let db;

function initDb() {
  const dir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'bot.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      tg_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      amount TEXT NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      invite_link TEXT,
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      UNIQUE (provider, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_tg ON payments(tg_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
  `);

  const { ensureDefaults } = require('./config');
  ensureDefaults();
}

function getDb() {
  if (!db) throw new Error('БД не инициализирована');
  return db;
}

module.exports = { initDb, getDb };
