// src/bot/handlers/reminder.js
// Handles the conversation for setting up reminders

const { getMedicines, saveReminder, getActiveReminders } = require('../../db/queries');
const { addReminder } = require('../../scheduler/reminders');

// Temporary state while user is setting up reminders
// In production you'd use a proper session library, but this works for a hackathon
const reminderSetupState = new Map(); // telegramId -> { step, medicines, currentIndex }

async function handleSetupReminders(ctx) {
  const telegramId = ctx.from.id;
  const medicines = getMedicines(telegramId);

  if (medicines.length === 0) {
    return ctx.reply('You have no medicines saved yet. Send me a prescription photo first!');
  }

  // Start the reminder setup flow
  reminderSetupState.set(telegramId, {
    step: 'awaiting_time',
    medicines,
    currentIndex: 0,
  });

  const firstMed = medicines[0];
  await ctx.reply(
    `⏰ Let's set up reminders!\n\n` +
    `What time should I remind you to take *${firstMed.name}*?\n\n` +
    `Reply with a time like: *8:00 AM* or *20:00*`,
    { parse_mode: 'Markdown' }
  );
}

async function handleReminderTimeInput(ctx) {
  const telegramId = ctx.from.id;
  const state = reminderSetupState.get(telegramId);

  if (!state || state.step !== 'awaiting_time') return false; // Not in setup flow

  const input = ctx.message.text.trim();

  // Parse the time input (handles "8:00 AM", "8 AM", "20:00", "8:30")
  const time24 = parseTimeTo24h(input);

  if (!time24) {
    await ctx.reply('❌ I didn\'t understand that time. Please try again, like: *8:00 AM* or *20:00*', { parse_mode: 'Markdown' });
    return true;
  }

  const currentMed = state.medicines[state.currentIndex];

  // Save the reminder to DB
  saveReminder(telegramId, currentMed.id, currentMed.name, time24);

  // Schedule it live
  addReminder(ctx.telegram, { // Note: pass telegram instance
    id: Date.now(), // temp id — real id comes from DB
    telegram_id: telegramId,
    medicine_id: currentMed.id,
    medicine_name: currentMed.name,
    reminder_time: time24,
  });

  await ctx.reply(`✅ Reminder set for *${currentMed.name}* at *${formatTime(time24)}*!`, { parse_mode: 'Markdown' });

  // Move to next medicine
  state.currentIndex++;

  if (state.currentIndex < state.medicines.length) {
    const nextMed = state.medicines[state.currentIndex];
    await ctx.reply(
      `What time for *${nextMed.name}*?\n\n_(or type /skip to skip this one)_`,
      { parse_mode: 'Markdown' }
    );
  } else {
    // Done!
    reminderSetupState.delete(telegramId);
    await ctx.reply(
      '🎉 *All reminders are set!*\n\nI\'ll message you at the right times every day. You can view or change your reminders with /reminders',
      { parse_mode: 'Markdown' }
    );
  }

  return true;
}

async function handleListReminders(ctx) {
  const telegramId = ctx.from.id;
  const reminders = getActiveReminders().filter(r => r.telegram_id === telegramId);

  if (reminders.length === 0) {
    return ctx.reply('You have no active reminders.\n\nSend me a prescription photo to get started!');
  }

  const list = reminders.map((r, i) =>
    `${i + 1}. *${r.medicine_name}* — ${formatTime(r.reminder_time)}`
  ).join('\n');

  await ctx.reply(`⏰ *Your Active Reminders:*\n\n${list}`, { parse_mode: 'Markdown' });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTimeTo24h(input) {
  // Handle "8:00 AM", "8 AM", "8:30 PM", "20:00", "8:30"
  const clean = input.toUpperCase().trim();

  const amPmMatch = clean.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (amPmMatch) {
    let hours = parseInt(amPmMatch[1]);
    const minutes = parseInt(amPmMatch[2] || '0');
    const period = amPmMatch[3];

    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  const h24Match = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1]);
    const minutes = parseInt(h24Match[2]);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  return null;
}

function formatTime(time24) {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

module.exports = {
  handleSetupReminders,
  handleReminderTimeInput,
  handleListReminders,
  reminderSetupState,
};
