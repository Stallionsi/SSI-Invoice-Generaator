/**
 * Overdue Invoice Reminder Cron Job
 *
 * Runs daily at 09:00 AM (server local time).
 * Finds all invoices that are:
 *   - More than 1 day past their dueDate
 *   - Status is not 'paid' or 'cancelled' or 'draft'
 *   - Have a recipientEmail
 *   - Have NOT been reminded in the last 24 hours (lastReminderSentAt guard)
 *
 * Sends an overdue reminder email to the client and updates lastReminderSentAt.
 *
 * Safety: lastReminderSentAt ensures one reminder per 24-hour window max.
 */

const cron = require('node-cron');
const Invoice = require('../models/Invoice.model');
const Company = require('../models/Company.model');
const { sendEmail } = require('../services/email.service');
const overdueReminderTemplate = require('../templates/emails/overdueReminder.template');
const { EMAIL_FROM_NAME, EMAIL_FROM_ADDRESS } = require('../config/env');
const logger = require('../utils/logger');

const SKIP_STATUSES = ['paid', 'cancelled', 'draft'];
const MIN_OVERDUE_DAYS = 1;           // must be at least this many days past due
const REMINDER_COOLDOWN_HOURS = 24;   // don't re-remind within this window

/**
 * Core logic — exported so it can be called directly in tests or on-demand.
 */
const runOverdueReminders = async () => {
  logger.info('[overdue-cron] Starting overdue invoice reminder run...');

  const now = new Date();

  // dueDate threshold: invoices due before (now - MIN_OVERDUE_DAYS days)
  const overdueCutoff = new Date(now);
  overdueCutoff.setDate(overdueCutoff.getDate() - MIN_OVERDUE_DAYS);

  // lastReminderSentAt threshold: skip if reminded within REMINDER_COOLDOWN_HOURS
  const cooldownCutoff = new Date(now);
  cooldownCutoff.setHours(cooldownCutoff.getHours() - REMINDER_COOLDOWN_HOURS);

  const invoices = await Invoice.find({
    status:    { $nin: SKIP_STATUSES },
    dueDate:   { $lt: overdueCutoff },
    recipientEmail: { $exists: true, $ne: '' },
    $or: [
      { lastReminderSentAt: { $exists: false } },
      { lastReminderSentAt: null },
      { lastReminderSentAt: { $lt: cooldownCutoff } },
    ],
  })
    .populate('client', 'clientName')
    .lean();

  logger.info(`[overdue-cron] Found ${invoices.length} overdue invoice(s) to remind.`);

  let sent = 0;
  let failed = 0;

  for (const invoice of invoices) {
    try {
      const dueDate = new Date(invoice.dueDate);
      const daysOverdue = Math.floor((now - dueDate) / 86_400_000);

      const clientName  = invoice.client?.clientName || invoice.recipientDetails?.name || 'Valued Client';
      const companyName = invoice.senderDetails?.name || 'Your Service Provider';
      const currency    = invoice.currency || 'INR';

      const html = overdueReminderTemplate({
        clientName,
        invoiceNumber: invoice.invoiceNumber,
        dueDate:       invoice.dueDate,
        balanceDue:    invoice.balanceDue ?? invoice.grandTotal,
        currency,
        daysOverdue,
        companyName,
      });

      await sendEmail({
        to:        invoice.recipientEmail,
        from:      `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>`,
        subject:   `Payment Reminder: Invoice ${invoice.invoiceNumber} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
        html,
        type:      'overdue_reminder',
        companyId: invoice.company?.toString(),
        invoiceId: invoice._id?.toString(),
      });

      // Update lastReminderSentAt + bump counter (use updateOne to avoid triggering full save hooks)
      await Invoice.updateOne(
        { _id: invoice._id },
        {
          lastReminderSentAt: now,
          $inc: { reminderCount: 1 },
        },
      );

      logger.info(`[overdue-cron] ✓ Reminder sent for ${invoice.invoiceNumber} (${daysOverdue}d overdue) → ${invoice.recipientEmail}`);
      sent++;
    } catch (err) {
      logger.error(`[overdue-cron] ✗ Failed to send reminder for ${invoice.invoiceNumber}: ${err.message}`);
      failed++;
    }
  }

  logger.info(`[overdue-cron] Run complete. Sent: ${sent}, Failed: ${failed}, Skipped: ${invoices.length - sent - failed}`);
};

/**
 * Schedule the cron — call this once at server startup.
 * Schedule: every day at 09:00 AM.
 */
const startOverdueCron = () => {
  cron.schedule('0 9 * * *', async () => {
    try {
      await runOverdueReminders();
    } catch (err) {
      logger.error('[overdue-cron] Unhandled error in cron run:', err.message);
    }
  });

  logger.info('[overdue-cron] Overdue reminder cron scheduled — runs daily at 09:00.');
};

module.exports = { startOverdueCron, runOverdueReminders };
