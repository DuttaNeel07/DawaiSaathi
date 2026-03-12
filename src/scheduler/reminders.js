// src/scheduler/reminders.js
// Loads all active reminders from DB and schedules them with node-cron
// Called once on bot startup

const cron = require('node-cron');
const { getActiveReminders } = require('../db/queries');

// Store active cron jobs so we can cancel them if needed
const activeJobs = new Map(); // reminderId -> cron job

/**
 * Starts all active reminders. Call this on bot startup.
 * @param {object} bot - The Telegraf bot instance
 */
function startAllReminders(bot) {
  const reminders = getActiveReminders();
  console.log(`⏰ Loading ${reminders.length} reminders...`);

  for (const reminder of reminders) {
    scheduleReminder(bot, reminder);
  }
}

/**
 * Schedules a single reminder as a cron job.
 * @param {object} bot - Telegraf bot instance
 * @param {object} reminder - Reminder row from DB
 */
function scheduleReminder(bot, reminder) {
  const [hour, minute] = reminder.reminder_time.split(':');

  // Cron format: "minute hour * * *" = every day at HH:MM
  const cronExpression = `${minute} ${hour} * * *`;

  if (!cron.validate(cronExpression)) {
    console.error(`Invalid cron expression for reminder ${reminder.id}: ${cronExpression}`);
    return;
  }

  const job = cron.schedule(
    cronExpression,
    async () => {
      try {
        await bot.telegram.sendMessage(
          reminder.telegram_id,
          `💊 *Reminder!*\n\nTime to take your *${reminder.medicine_name}*.\n\nDid you take it?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Yes, taken!', callback_data: `dose_taken_${reminder.medicine_id}` },
                  { text: '⏭️ Skip', callback_data: `dose_skipped_${reminder.medicine_id}` },
                ],
              ],
            },
          }
        );
      } catch (err) {
        console.error(`Failed to send reminder ${reminder.id}:`, err.message);
      }
    },
    {
      timezone: 'Asia/Kolkata', // IST
    }
  );

  activeJobs.set(reminder.id, job);
  console.log(`✅ Scheduled reminder for ${reminder.medicine_name} at ${reminder.reminder_time} IST`);
}

/**
 * Add a new reminder without restarting the bot.
 * Call this after saving a new reminder to the DB.
 */
function addReminder(bot, reminder) {
  scheduleReminder(bot, reminder);
}

/**
 * Cancel a reminder by its DB id.
 */
function cancelReminder(reminderId) {
  const job = activeJobs.get(reminderId);
  if (job) {
    job.stop();
    activeJobs.delete(reminderId);
    console.log(`❌ Cancelled reminder ${reminderId}`);
  }
}

module.exports = { startAllReminders, addReminder, cancelReminder };
