/**
 * Recurring Invoice Worker
 * Finds all recurring invoices due for generation and creates new ones.
 * Self-schedules: queues the next run 24 hours after each completion.
 *
 * Standalone : node src/jobs/recurring.worker.js
 * Combined   : imported by src/jobs/worker.js
 */

require('dotenv').config();

const { Worker, Queue } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB       = require('../config/db');
const Invoice         = require('../models/Invoice.model');
const invoiceService  = require('../services/invoice.service');
const logger          = require('../utils/logger');
const dayjs           = require('dayjs');

// ─── Job processor ───────────────────────────────────────────────────────────
const processDueRecurring = async (job) => {
  logger.info('[recurring-worker] ► Checking for due recurring invoices...');
  const today = dayjs().startOf('day').toDate();

  const dueInvoices = await Invoice.find({
    isRecurring: true,
    status:      { $nin: ['cancelled', 'draft'] },
    'recurringSettings.nextInvoiceDate': { $lte: today },
    $or: [
      { 'recurringSettings.endDate': null },
      { 'recurringSettings.endDate': { $gte: today } },
    ],
    $expr: {
      $or: [
        { $eq: ['$recurringSettings.totalCycles', null] },
        { $lt: ['$recurringSettings.completedCycles', '$recurringSettings.totalCycles'] },
      ],
    },
  }).lean();

  logger.info(`[recurring-worker] Found ${dueInvoices.length} recurring invoices to process`);

  let generated = 0;
  for (const source of dueInvoices) {
    try {
      const newInvoice = await invoiceService.duplicate(
        source._id,
        source.company.toString(),
        source.createdBy?.toString()
      );

      const nextDate = calculateNextDate(
        source.recurringSettings.nextInvoiceDate || today,
        source.recurringSettings.frequency
      );

      await Invoice.findByIdAndUpdate(source._id, {
        'recurringSettings.nextInvoiceDate': nextDate,
        'recurringSettings.lastGeneratedAt': new Date(),
        $inc: { 'recurringSettings.completedCycles': 1 },
      });

      if (source.status === 'sent' && source.recipientEmail) {
        await invoiceService.sendInvoiceEmail(
          newInvoice._id.toString(),
          source.company.toString(),
          { recipientEmail: source.recipientEmail },
          source.createdBy?.toString()
        );
      }

      generated++;
      logger.info(`[recurring-worker] ✓ Generated recurring invoice: ${newInvoice.invoiceNumber}`);
    } catch (err) {
      logger.error(
        `[recurring-worker] ✗ Failed to generate from ${source._id}: ${err.message}`
      );
    }
  }

  return { processed: dueInvoices.length, generated };
};

const calculateNextDate = (currentDate, frequency) => {
  const d = dayjs(currentDate);
  switch (frequency) {
    case 'weekly':    return d.add(1, 'week').toDate();
    case 'monthly':   return d.add(1, 'month').toDate();
    case 'quarterly': return d.add(3, 'month').toDate();
    case 'yearly':    return d.add(1, 'year').toDate();
    default:          return d.add(1, 'month').toDate();
  }
};

// ─── Worker factory ───────────────────────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const worker = new Worker('recurring', processDueRecurring, {
    connection:  getRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', async (job, result) => {
    logger.info(
      `[recurring-worker] ✓ Done — generated ${result?.generated} of ${result?.processed}`
    );
    // Self-schedule: queue next run for tomorrow
    try {
      const recurringQueue = new Queue('recurring', { connection: getRedisConnection() });
      await recurringQueue.add('process-recurring', {}, {
        delay: 24 * 60 * 60 * 1000,
        jobId: `recurring-daily-${dayjs().add(1, 'day').format('YYYY-MM-DD')}`,
      });
    } catch (err) {
      logger.error(`[recurring-worker] Failed to self-schedule next run: ${err.message}`);
    }
  });

  worker.on('failed', (job, err) => {
    const remaining = Math.max(0, (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0) - 1);
    logger.error(
      `[recurring-worker] ✗ Failed [${job?.id}] | ${err.message} | retries left: ${remaining}`
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[recurring-worker] ⚠ Job stalled [${jobId}]`);
  });

  worker.on('error', (err) => {
    logger.error(`[recurring-worker] Worker-level error: ${err.message}`);
  });

  logger.info('[recurring-worker] ✓ Started — listening on queue "recurring"');
  return worker;
};

// ─── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  startWorker()
    .then((worker) => {
      const shutdown = async (signal) => {
        logger.info(`[recurring-worker] ${signal} received — closing gracefully...`);
        await worker.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('[recurring-worker] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { startWorker };
