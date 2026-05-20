/**
 * Combined Worker Process
 * Starts ALL BullMQ workers in a single Node.js process.
 *
 * Use this for:
 *   - Production: single Background Worker service on Render / Railway
 *   - Local dev:  `npm run workers` when you don't want separate terminals
 *
 * Individual workers can still be run standalone:
 *   node src/jobs/email.worker.js
 *   node src/jobs/reminder.worker.js
 *   etc.
 *
 * Run: node src/jobs/worker.js
 */

require('dotenv').config();

const connectDB  = require('../config/db');
const logger     = require('../utils/logger');

const { startWorker: startEmailWorker }     = require('./email.worker');
const { startWorker: startReminderWorker }  = require('./reminder.worker');
const { startWorker: startPdfWorker }       = require('./pdf.worker');
const { startWorker: startRecurringWorker } = require('./recurring.worker');
const { startWorker: startWebhookWorker }   = require('./webhook.worker');

const startAll = async () => {
  logger.info('[workers] Connecting to MongoDB...');
  await connectDB();
  logger.info('[workers] MongoDB connected');

  logger.info('[workers] Starting all BullMQ workers...');

  // Start all workers concurrently — each creates its own Redis connection
  const [emailW, reminderW, pdfW, recurringW, webhookW] = await Promise.all([
    startEmailWorker(),
    startReminderWorker(),
    startPdfWorker(),
    startRecurringWorker(),
    startWebhookWorker(),
  ]);

  logger.info('[workers] ═══════════════════════════════════════');
  logger.info('[workers] ✓ All workers running');
  logger.info('[workers]   email      — queue: email      (concurrency: 5)');
  logger.info('[workers]   reminder   — queue: reminder   (concurrency: 10)');
  logger.info('[workers]   pdf        — queue: pdf        (concurrency: 2)');
  logger.info('[workers]   recurring  — queue: recurring  (concurrency: 1)');
  logger.info('[workers]   webhook    — queue: webhook    (concurrency: 5)');
  logger.info('[workers] ═══════════════════════════════════════');
  logger.info('[workers] Waiting for jobs... (Ctrl+C to stop)');

  // ─── Graceful shutdown ──────────────────────────────────────────────────
  const workers = [emailW, reminderW, pdfW, recurringW, webhookW];

  const shutdown = async (signal) => {
    logger.info(`[workers] ${signal} received — shutting down all workers...`);
    await Promise.allSettled(workers.map((w) => w?.close()));
    logger.info('[workers] All workers closed. Exiting.');
    process.exit(0);
  };

  // Force exit after 15s if graceful shutdown hangs
  const forceExit = (signal) => {
    shutdown(signal).catch(() => {});
    setTimeout(() => {
      logger.error('[workers] Forced exit after 15s timeout');
      process.exit(1);
    }, 15_000).unref();
  };

  process.on('SIGTERM', () => forceExit('SIGTERM'));
  process.on('SIGINT',  () => forceExit('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('[workers] Unhandled rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('[workers] Uncaught exception:', err.message);
    forceExit('uncaughtException');
  });
};

startAll().catch((err) => {
  logger.error('[workers] Fatal startup error:', err.message);
  if (err.stack) logger.error(err.stack);
  process.exit(1);
});
