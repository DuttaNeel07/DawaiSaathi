// src/bot/index.js
// ─────────────────────────────────────────────────────────
// TEAMMATE B — This is your main file.
// All bot commands, message routing, and callback handling.
// ─────────────────────────────────────────────────────────

require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initDb } = require('../db/schema');
const { startAllReminders } = require('../scheduler/reminders');
const { handleStart } = require('./handlers/start');
const { handlePhoto } = require('./handlers/prescription');
const {
  handleSetupReminders,
  handleReminderTimeInput,
  handleListReminders,
} = require('./handlers/reminder');
const {
  getMedicines,
  getAdherenceScore,
  logDose,
  setUserLanguage,
  upsertUser,
} = require('../db/queries');

// ── Init ──────────────────────────────────────────────────────────────────────

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize DB and start reminders
initDb();
startAllReminders(bot);

// ── Commands ──────────────────────────────────────────────────────────────────

bot.start(handleStart);
bot.help((ctx) => ctx.reply(
  '📋 *DawaiSathi Commands:*\n\n' +
  '📸 Send a photo — read your prescription\n' +
  '/medicines — view your saved medicines\n' +
  '/reminders — view your active reminders\n' +
  '/score — see your medication adherence score\n' +
  '/language — change language (English/Hindi)\n' +
  '/help — show this message',
  { parse_mode: 'Markdown' }
));

// Language selection
bot.command('language', async (ctx) => {
  await ctx.reply(
    '🌐 Choose your language / अपनी भाषा चुनें:',
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇬🇧 English', callback_data: 'lang_en' },
            { text: '🇮🇳 हिन्दी', callback_data: 'lang_hi' },
          ],
        ],
      },
    }
  );
});

// List medicines
bot.command('medicines', async (ctx) => {
  const medicines = getMedicines(ctx.from.id);
  if (medicines.length === 0) {
    return ctx.reply('No medicines saved yet. Send me a prescription photo to get started!');
  }
  const list = medicines.map((m, i) =>
    `${i + 1}. *${m.name}* — ${m.dose || '?'}, ${m.frequency || '?'}, ${m.duration || '?'}`
  ).join('\n');
  await ctx.reply(`💊 *Your Medicines:*\n\n${list}`, { parse_mode: 'Markdown' });
});

// List reminders
bot.command('reminders', handleListReminders);

// Adherence score
bot.command('score', async (ctx) => {
  const score = getAdherenceScore(ctx.from.id);
  if (score === null) {
    return ctx.reply('No dose data yet. Start confirming your doses when reminded and your score will appear here!');
  }
  const emoji = score >= 80 ? '🌟' : score >= 60 ? '👍' : '💪';
  await ctx.reply(
    `${emoji} *Your Medication Adherence Score: ${score}%*\n\n` +
    (score >= 80
      ? 'Excellent! You are taking your medicines very consistently.'
      : score >= 60
      ? 'Good job! Try to take your medicines more consistently.'
      : 'You can do better! Set reminders to help you stay on track.'),
    { parse_mode: 'Markdown' }
  );
});

// ── Photo handler ──────────────────────────────────────────────────────────────

bot.on('photo', handlePhoto);

// ── Text messages (could be reminder time input) ──────────────────────────────

bot.on('text', async (ctx) => {
  // Check if the user is in the middle of setting up a reminder
  const handled = await handleReminderTimeInput(ctx);
  if (!handled) {
    // Not in a flow — give a helpful nudge
    await ctx.reply(
      '👋 Send me a photo of your prescription to get started!\n\nOr use /help to see what I can do.',
    );
  }
});

// ── Callback queries (button presses) ────────────────────────────────────────

bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  const telegramId = ctx.from.id;

  await ctx.answerCbQuery(); // Dismiss the loading spinner

  // Language selection
  if (data === 'lang_en') {
    setUserLanguage(telegramId, 'en');
    return ctx.reply('✅ Language set to English!');
  }
  if (data === 'lang_hi') {
    setUserLanguage(telegramId, 'hi');
    return ctx.reply('✅ भाषा हिन्दी में सेट की गई!');
  }

  // Reminder setup
  if (data === 'setup_reminders') {
    return handleSetupReminders(ctx);
  }
  if (data === 'skip_reminders') {
    return ctx.reply('No problem! You can set reminders anytime with /reminders');
  }

  // Dose confirmation (from reminder buttons)
  if (data.startsWith('dose_taken_')) {
    const medicineId = parseInt(data.replace('dose_taken_', ''));
    logDose(telegramId, medicineId, true);
    return ctx.reply('✅ Great job! Dose logged. Keep it up! 💪');
  }
  if (data.startsWith('dose_skipped_')) {
    const medicineId = parseInt(data.replace('dose_skipped_', ''));
    logDose(telegramId, medicineId, false);
    return ctx.reply('⏭️ Skipped. Try not to miss doses — consistency is key!');
  }
});

// ── Error handling ────────────────────────────────────────────────────────────

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('😔 Something went wrong. Please try again.').catch(() => {});
});

// ── Launch ────────────────────────────────────────────────────────────────────

bot.launch()
  .then(() => console.log('🚀 DawaiSathi bot is running!'))
  .catch((err) => {
    console.error('Failed to start bot:', err);
    process.exit(1);
  });

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
