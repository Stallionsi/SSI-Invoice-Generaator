/**
 * Reminder Worker
 * Processes jobs from the 'reminder' BullMQ queue.
 * Sends payment reminders for unpaid invoices on schedule.
 *
 * Reminder types:
 *   before_due_3days  → 3 days before due date
 *   on_due_date       → on the due date itself
 *   after_due_3days   → 3 days overdue
 *   after_due_7days   → 7 days overdue
 *   after_due_14days  → 14 days overdue
 *   after_due_30days  → 30 days overdue
 *
 * Run: node src/jobs/reminder.worker.js
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB = require('../config/db');
const Invoice = require('../models/Invoice.model');
const ReminderLog = require('../models/ReminderLog.model');
const emailService = require('../services/email.service');
const { addEmailJob } = require('../config/queue');
const logger = require('../utils/logger');

const SKIP_STATUSES = ['paid', 'cancelled', 'draft'];

const processReminder = async (job) => {
  const { invoiceId, reminderType, companyId } = job.data;
  logger.info(`[reminder-worker] Processing reminder: ${reminderType} for invoice ${invoiceId}`);

  const invoice = await Invoice.findById(invoiceId).lean();

  // Skip if invoice is already paid/cancelled
  if (!invoice || SKIP_STATUSES.includes(invoice.status)) {
    logger.info(`[reminder-worker] Skipping reminder — invoice ${invoiceId} status: ${invoice?.status || 'not found'}`);
    await ReminderLog.create({ invoice: invoiceId, company: companyId, reminderType, status: 'skipped', balanceDue: invoice?.balanceDue, dueDate: invoice?.dueDate, jobId: job.id });
    return;
  }

  if (!invoice.reminderEnabled) {
    logger.info(`[reminder-worker] Reminders disabled for invoice ${invoiceId}`);
    return;
  }

  // Check for duplicate — don't send same reminder twice
  const alreadySent = await ReminderLog.findOne({ invoice: invoiceId, reminderType, status: 'sent' });
  if (alreadySent) {
    logger.info(`[reminder-worker] Reminder ${reminderType} already sent for invoice ${invoiceId}`);
    return;
  }

  try {
    // Queue the actual email through email worker
    await addEmailJob('payment-reminder', { invoiceId, reminderType, companyId });

    await ReminderLog.create({
      invoice:      invoiceId,
      company:      companyId,
      client:       invoice.client,
      reminderType,
      sentTo:       [invoice.recipientEmail].filter(Boolean),
      status:       'sent',
      balanceDue:   invoice.balanceDue,
      dueDate:      invoice.dueDate,
      jobId:        job.id,
    });

    // Increment reminder count on invoice
    await Invoice.findByIdAndUpdate(invoiceId, {
      lastReminderSentAt: new Date(),
      $inc: { reminderCount: 1 },
    });

    logger.info(`[reminder-worker] ✓ Reminder queued: ${reminderType} for invoice ${invoiceId}`);
  } catch (err) {
    await ReminderLog.create({
      invoice:      invoiceId,
      company:      companyId,
      reminderType,
      status:       'failed',
      errorMessage: err.message,
      jobId:        job.id,
    });
    throw err; // re-throw so BullMQ can retry
  }
};

const startWorker = async () => {
  await connectDB();

  const worker = new Worker('reminder', processReminder, {
    connection: getRedisConnection(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info(`[reminder-worker] ✓ Reminder completed [${job.id}]`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[reminder-worker] ✗ Reminder failed [${job?.id}]:`, err.message);
  });

  worker.on('error', (err) => {
    logger.error('[reminder-worker] Worker error:', err.message);
  });

  logger.info('[reminder-worker] Reminder worker started. Waiting for jobs...');
};

startWorker().catch((err) => {
  logger.error('[reminder-worker] Failed to start:', err);
  process.exit(1);
});
