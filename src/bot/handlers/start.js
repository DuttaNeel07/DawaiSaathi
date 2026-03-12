// src/bot/handlers/start.js
const { upsertUser, getUser } = require('../../db/queries');

async function handleStart(ctx) {
  const telegramId = ctx.from.id;
  const name = ctx.from.first_name || 'there';

  upsertUser(telegramId, name);

  await ctx.reply(
    `🙏 *Namaste ${name}! Welcome to DawaiSathi* 💊\n\n` +
    `I'm your personal medicine companion. I can help you:\n\n` +
    `📋 *Read your prescriptions* — just send me a photo\n` +
    `⏰ *Set medicine reminders* — never miss a dose\n` +
    `💸 *Find cheaper generics* — save up to 80% on medicines\n` +
    `⚠️ *Check drug interactions* — stay safe\n\n` +
    `To get started, send me a photo of your prescription!\n\n` +
    `─────────────────\n` +
    `🌐 Language / भाषा: /language\n` +
    `📋 My medicines: /medicines\n` +
    `⏰ My reminders: /reminders\n` +
    `📊 Adherence score: /score`,
    { parse_mode: 'Markdown' }
  );
}

module.exports = { handleStart };
