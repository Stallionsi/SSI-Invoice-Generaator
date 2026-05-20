/**
 * Email Worker
 * Processes jobs from the 'email' BullMQ queue.
 * Handles: invoice emails, payment receipts, payment reminders.
 *
 * Standalone : node src/jobs/email.worker.js
 * Combined   : imported by src/jobs/worker.js
 */

require('dotenv').config();

const { Worker }   = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB    = require('../config/db');
const emailService = require('../services/email.service');
const logger       = require('../utils/logger');

// ─── Job processor ───────────────────────────────────────────────────────────
const processJob = async (job) => {
  const attempt    = job.attemptsMade + 1;
  const maxAttempts = job.opts?.attempts ?? 3;

  logger.info(
    `[email-worker] ► Processing ${job.name} [${job.id}] ` +
    `(attempt ${attempt}/${maxAttempts})`
  );

  switch (job.name) {
    case 'invoice-email':
      await emailService.sendInvoiceEmail(job.data);
      logger.info(`[email-worker] ✓ Invoice email sent — invoice ${job.data.invoiceId}`);
      break;

    case 'payment-receipt':
      await emailService.sendPaymentReceipt(job.data);
      logger.info(`[email-worker] ✓ Payment receipt sent — invoice ${job.data.invoiceId}`);
      break;

    case 'payment-reminder':
      await emailService.sendPaymentReminder(job.data);
      logger.info(
        `[email-worker] ✓ Payment reminder sent — ` +
        `invoice ${job.data.invoiceId} type=${job.data.reminderType}`
      );
      break;

    default:
      logger.warn(`[email-worker] Unknown job type: "${job.name}" [${job.id}] — discarding`);
  }
};

// ─── Worker factory ───────────────────────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const worker = new Worker('email', processJob, {
    connection:  getRedisConnection(),
    concurrency: 5,
    limiter: {
      max:      20,   // max 20 emails
      duration: 1000, // per second (SMTP/Resend rate limit)
    },
  });

  worker.on('completed', (job) => {
    logger.info(`[email-worker] ✓ Completed ${job.name} [${job.id}]`);
  });

  worker.on('failed', (job, err) => {
    const remaining = Math.max(0, (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0) - 1);
    logger.error(
      `[email-worker] ✗ Failed ${job?.name} [${job?.id}] | ` +
      `${err.message} | retries left: ${remaining}`
    );
    if (err.stack) logger.debug(`[email-worker] Stack:\n${err.stack}`);
    if (remaining === 0) {
      logger.error(
        `[email-worker] ✗ All retries exhausted for ${job?.name} [${job?.id}] ` +
        `— invoice ${job?.data?.invoiceId}`
      );
    }
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[email-worker] ⚠ Job stalled [${jobId}] — BullMQ will retry automatically`);
  });

  worker.on('error', (err) => {
    logger.error(`[email-worker] Worker-level error: ${err.message}`);
  });

  logger.info('[email-worker] ✓ Started — listening on queue "email"');
  return worker;
};

// ─── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  startWorker()
    .then((worker) => {
      const shutdown = async (signal) => {
        logger.info(`[email-worker] ${signal} received — closing gracefully...`);
        await worker.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('[email-worker] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { startWorker };
