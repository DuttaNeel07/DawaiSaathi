// src/db/queries.js
// All database operations live here — import this wherever you need DB access

const { getDb } = require('./schema');

// ─── USERS ────────────────────────────────────────────────────────────────────

function upsertUser(telegramId, name) {
  const db = getDb();
  db.prepare(`
    INSERT INTO users (telegram_id, name)
    VALUES (?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET name = excluded.name
  `).run(telegramId, name);
}

function getUser(telegramId) {
  return getDb().prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
}

function setUserLanguage(telegramId, language) {
  getDb().prepare('UPDATE users SET language = ? WHERE telegram_id = ?').run(language, telegramId);
}

// ─── MEDICINES ────────────────────────────────────────────────────────────────

function saveMedicines(telegramId, medicines) {
  // medicines = array of { name, dose, frequency, duration, instructions }
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO medicines (telegram_id, name, dose, frequency, duration, instructions)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((meds) => {
    for (const med of meds) {
      insert.run(telegramId, med.name, med.dose, med.frequency, med.duration, med.instructions);
    }
  });

  insertMany(medicines);
}

function getMedicines(telegramId) {
  return getDb().prepare('SELECT * FROM medicines WHERE telegram_id = ?').all(telegramId);
}

// ─── REMINDERS ────────────────────────────────────────────────────────────────

function saveReminder(telegramId, medicineId, medicineName, time) {
  getDb().prepare(`
    INSERT INTO reminders (telegram_id, medicine_id, medicine_name, reminder_time)
    VALUES (?, ?, ?, ?)
  `).run(telegramId, medicineId, medicineName, time);
}

function getActiveReminders() {
  return getDb().prepare('SELECT * FROM reminders WHERE is_active = 1').all();
}

function deactivateReminder(reminderId) {
  getDb().prepare('UPDATE reminders SET is_active = 0 WHERE id = ?').run(reminderId);
}

// ─── DOSE LOGS ────────────────────────────────────────────────────────────────

function logDose(telegramId, medicineId, wasTaken) {
  getDb().prepare(`
    INSERT INTO dose_logs (telegram_id, medicine_id, was_taken)
    VALUES (?, ?, ?)
  `).run(telegramId, medicineId, wasTaken ? 1 : 0);
}

function getAdherenceScore(telegramId) {
  const db = getDb();
  const result = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(was_taken) as taken
    FROM dose_logs
    WHERE telegram_id = ?
  `).get(telegramId);

  if (!result || result.total === 0) return null;
  return Math.round((result.taken / result.total) * 100);
}

module.exports = {
  upsertUser, getUser, setUserLanguage,
  saveMedicines, getMedicines,
  saveReminder, getActiveReminders, deactivateReminder,
  logDose, getAdherenceScore,
};
