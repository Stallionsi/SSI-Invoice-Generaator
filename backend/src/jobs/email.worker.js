/**
 * Email Worker
 * Processes jobs from the 'email' BullMQ queue.
 * Handles: invoice emails, payment receipts
 *
 * Run: node src/jobs/email.worker.js
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB = require('../config/db');
const emailService = require('../services/email.service');
const EmailLog = require('../models/EmailLog.model');
const logger = require('../utils/logger');

const processJob = async (job) => {
  const { name, data } = job;
  logger.info(`[email-worker] Processing job: ${name} [${job.id}]`);

  switch (name) {
    case 'invoice-email':
      await emailService.sendInvoiceEmail(data);
      break;

    case 'payment-receipt':
      await emailService.sendPaymentReceipt(data);
      break;

    case 'payment-reminder':
      await emailService.sendPaymentReminder(data);
      break;

    default:
      logger.warn(`[email-worker] Unknown job type: ${name}`);
  }
};

const startWorker = async () => {
  await connectDB();

  const worker = new Worker('email', processJob, {
    connection: getRedisConnection(),
    concurrency: 5,           // process 5 emails at a time
    limiter: {
      max:      20,           // max 20 jobs
      duration: 1000,         // per second (rate limit for SMTP)
    },
  });

  worker.on('completed', (job) => {
    logger.info(`[email-worker] ✓ Job completed: ${job.name} [${job.id}]`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[email-worker] ✗ Job failed: ${job?.name} [${job?.id}]`, { error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('[email-worker] Worker error:', err.message);
  });

  logger.info('[email-worker] Email worker started. Waiting for jobs...');
};

startWorker().catch((err) => {
  logger.error('[email-worker] Failed to start:', err);
  process.exit(1);
});
