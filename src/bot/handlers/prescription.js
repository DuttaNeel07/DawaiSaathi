// src/bot/handlers/prescription.js
// This handler receives a prescription photo, calls Claude, and responds

const { parsePrescription, explainMedicines, checkInteractions } = require('../../ai/claude');
const { saveMedicines, getUser } = require('../../db/queries');
const { calculateSavings, formatSavingsMessage } = require('../../data/generics');
const https = require('https');

/**
 * Downloads a Telegram file as a Buffer.
 */
async function downloadFile(fileUrl) {
  return new Promise((resolve, reject) => {
    https.get(fileUrl, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

async function handlePhoto(ctx) {
  const telegramId = ctx.from.id;
  const user = getUser(telegramId);
  const language = user?.language || 'en';

  // Show typing indicator
  await ctx.sendChatAction('typing');
  const processingMsg = await ctx.reply('📋 Reading your prescription... please wait a moment.');

  try {
    // Get the highest-resolution photo Telegram has
    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];

    // Get the file download URL from Telegram
    const file = await ctx.telegram.getFile(bestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    // Download the image
    const imageBuffer = await downloadFile(fileUrl);
    const imageBase64 = imageBuffer.toString('base64');

    // Determine media type from file path
    const mediaType = file.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // ── Step 1: Parse prescription with Claude ──
    await ctx.sendChatAction('typing');
    const parsed = await parsePrescription(imageBase64, mediaType);

    if (parsed.error) {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
      return ctx.reply(`❌ ${parsed.error}\n\nTips for a better photo:\n• Good lighting\n• Hold the camera steady\n• Make sure all text is visible`);
    }

    const medicines = parsed.medicines || [];

    if (medicines.length === 0) {
      await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);
      return ctx.reply('🤔 I could not find any medicines in this image. Please try a clearer photo of your prescription.');
    }

    // Save to DB
    saveMedicines(telegramId, medicines);

    // ── Step 2: Explain medicines ──
    await ctx.sendChatAction('typing');
    const explanation = await explainMedicines(medicines, language);

    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id);

    // Send parsed list first
    const medList = medicines.map((m, i) =>
      `${i + 1}. *${m.name}* — ${m.dose || '?'}, ${m.frequency || '?'}`
    ).join('\n');

    await ctx.reply(
      `✅ *Found ${medicines.length} medicine(s):*\n\n${medList}`,
      { parse_mode: 'Markdown' }
    );

    // Send explanation
    await ctx.reply(`💬 *Explanation:*\n\n${explanation}`, { parse_mode: 'Markdown' });

    // ── Step 3: Generic alternatives ──
    const savings = calculateSavings(medicines);
    if (savings.totalMonthlySaving > 0) {
      await ctx.reply(formatSavingsMessage(savings), { parse_mode: 'Markdown' });
    }

    // ── Step 4: Drug interactions ──
    if (medicines.length >= 2) {
      await ctx.sendChatAction('typing');
      const medNames = medicines.map((m) => m.name);
      const interactions = await checkInteractions(medNames);
      if (interactions) {
        await ctx.reply(`⚠️ *Drug Interaction Check:*\n\n${interactions}`, { parse_mode: 'Markdown' });
      }
    }

    // ── Step 5: Offer to set reminders ──
    if (medicines.length > 0) {
      await ctx.reply(
        '⏰ Would you like me to set medication reminders for you?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Yes, set reminders', callback_data: 'setup_reminders' },
                { text: '❌ No thanks', callback_data: 'skip_reminders' },
              ],
            ],
          },
        }
      );
    }

  } catch (err) {
    console.error('Error processing prescription:', err);
    await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
    await ctx.reply('😔 Something went wrong while reading your prescription. Please try again.');
  }
}

module.exports = { handlePhoto };
