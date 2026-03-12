// src/db/schema.js
// Run this once on startup to create all tables

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './dawaisathi.db';

let db;

function getDb() {
  if (!db) {
    db = new Database(path.resolve(DB_PATH));
    db.pragma('journal_mode = WAL'); // Better performance
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    -- Users table: one row per Telegram user
    CREATE TABLE IF NOT EXISTS users (
      telegram_id   INTEGER PRIMARY KEY,
      name          TEXT,
      language      TEXT DEFAULT 'en',  -- 'en' or 'hi'
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Medicines table: medicines extracted from a prescription
    CREATE TABLE IF NOT EXISTS medicines (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      name          TEXT NOT NULL,
      dose          TEXT,         -- e.g. "500mg"
      frequency     TEXT,         -- e.g. "twice a day"
      duration      TEXT,         -- e.g. "5 days"
      instructions  TEXT,         -- e.g. "after food"
      added_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );

    -- Reminders table: scheduled reminders for each medicine
    CREATE TABLE IF NOT EXISTS reminders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      medicine_id   INTEGER NOT NULL,
      medicine_name TEXT NOT NULL,
      reminder_time TEXT NOT NULL,   -- "HH:MM" in 24h format e.g. "08:00"
      is_active     INTEGER DEFAULT 1,
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id),
      FOREIGN KEY (medicine_id) REFERENCES medicines(id)
    );

    -- Dose logs: track when user confirms taking a dose
    CREATE TABLE IF NOT EXISTS dose_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id   INTEGER NOT NULL,
      medicine_id   INTEGER NOT NULL,
      taken_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      was_taken     INTEGER DEFAULT 1,  -- 1 = taken, 0 = skipped
      FOREIGN KEY (telegram_id) REFERENCES users(telegram_id)
    );
  `);

  console.log('✅ Database initialized');
  return db;
}

module.exports = { getDb, initDb };
