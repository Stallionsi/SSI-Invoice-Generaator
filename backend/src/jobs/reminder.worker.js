/**
 * Reminder Worker
 * Processes jobs from the 'reminder' BullMQ queue.
 *
 * Reminder types:
 *   before_due_3days  → 3 days before due date
 *   on_due_date       → on the due date itself
 *   after_due_3days   → 3 days overdue
 *   after_due_7days   → 7 days overdue
 *   after_due_14days  → 14 days overdue
 *   after_due_30days  → 30 days overdue
 *
 * Standalone : node src/jobs/reminder.worker.js
 * Combined   : imported by src/jobs/worker.js
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB    = require('../config/db');
const Invoice      = require('../models/Invoice.model');
const ReminderLog  = require('../models/ReminderLog.model');
const { addEmailJob } = require('../config/queue');
const logger       = require('../utils/logger');

const SKIP_STATUSES = ['paid', 'cancelled'];

// ─── Job processor ───────────────────────────────────────────────────────────
const processReminder = async (job) => {
  const { invoiceId, reminderType, companyId } = job.data;
  const attempt = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 3;

  logger.info(
    `[reminder-worker] ► Processing ${reminderType} for invoice ${invoiceId} ` +
    `(attempt ${attempt}/${maxAttempts})`
  );

  const invoice = await Invoice.findById(invoiceId).lean();

  if (!invoice) {
    logger.warn(`[reminder-worker] Invoice ${invoiceId} not found — skipping job`);
    return;
  }

  if (SKIP_STATUSES.includes(invoice.status)) {
    logger.info(
      `[reminder-worker] Invoice ${invoiceId} is ${invoice.status} — skipping ${reminderType}`
    );
    await ReminderLog.create({
      invoice:      invoiceId,
      company:      companyId,
      reminderType,
      status:       'skipped',
      balanceDue:   invoice.balanceDue,
      dueDate:      invoice.dueDate,
      jobId:        job.id,
    });
    return;
  }

  if (!invoice.reminderEnabled) {
    logger.info(`[reminder-worker] Reminders disabled for invoice ${invoiceId} — skipping`);
    return;
  }

  // Dedup guard — never send the same milestone twice
  const alreadySent = await ReminderLog.findOne({
    invoice: invoiceId,
    reminderType,
    status:  'sent',
  });
  if (alreadySent) {
    logger.info(
      `[reminder-worker] ${reminderType} already sent for invoice ${invoiceId} — dedup skip`
    );
    return;
  }

  try {
    // Hand off to email worker — keeps reminder worker fast, email worker handles retries
    await addEmailJob('payment-reminder', { invoiceId, reminderType, companyId });

    await ReminderLog.create({
      invoice:    invoiceId,
      company:    companyId,
      client:     invoice.client,
      reminderType,
      sentTo:     [invoice.recipientEmail].filter(Boolean),
      status:     'sent',
      balanceDue: invoice.balanceDue,
      dueDate:    invoice.dueDate,
      jobId:      job.id,
    });

    await Invoice.findByIdAndUpdate(invoiceId, {
      lastReminderSentAt: new Date(),
      $inc: { reminderCount: 1 },
    });

    logger.info(
      `[reminder-worker] ✓ ${reminderType} queued for email ` +
      `→ invoice ${invoiceId} (${invoice.recipientEmail || 'no email'})`
    );
  } catch (err) {
    logger.error(
      `[reminder-worker] ✗ Failed to process ${reminderType} for invoice ${invoiceId}: ${err.message}`
    );
    // Log failure to DB (best-effort — don't let logging failure mask the real error)
    await ReminderLog.create({
      invoice:      invoiceId,
      company:      companyId,
      reminderType,
      status:       'failed',
      errorMessage: err.message,
      jobId:        job.id,
    }).catch(() => {});

    throw err; // re-throw so BullMQ retries with backoff
  }
};

// ─── Worker factory ───────────────────────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const worker = new Worker('reminder', processReminder, {
    connection:  getRedisConnection(),
    concurrency: 10,
  });

  worker.on('completed', (job) => {
    logger.info(
      `[reminder-worker] ✓ Completed [${job.id}] — ` +
      `${job.data.reminderType} for invoice ${job.data.invoiceId}`
    );
  });

  worker.on('failed', (job, err) => {
    const remaining = Math.max(0, (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0) - 1);
    logger.error(
      `[reminder-worker] ✗ Failed [${job?.id}] — ` +
      `${job?.data?.reminderType} for invoice ${job?.data?.invoiceId} | ` +
      `${err.message} | retries left: ${remaining}`
    );
    if (remaining === 0) {
      logger.error(`[reminder-worker] ✗ All retries exhausted for job [${job?.id}]`);
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[reminder-worker] ⚠ Job stalled [${jobId}] — BullMQ will retry automatically`);
  });

  worker.on('error', (err) => {
    logger.error(`[reminder-worker] Worker-level error: ${err.message}`);
  });

  logger.info('[reminder-worker] ✓ Started — listening on queue "reminder"');
  return worker;
};

// ─── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  startWorker()
    .then((worker) => {
      const shutdown = async (signal) => {
        logger.info(`[reminder-worker] ${signal} received — closing gracefully...`);
        await worker.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('[reminder-worker] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { startWorker };
