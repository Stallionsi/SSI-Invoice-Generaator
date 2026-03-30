/**
 * Recurring Invoice Worker
 * Runs via BullMQ Scheduler or a cron trigger.
 * Each day, finds all recurring invoices due for generation and creates new ones.
 *
 * Run: node src/jobs/recurring.worker.js
 */

require('dotenv').config();

const { Worker, Queue } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB = require('../config/db');
const Invoice = require('../models/Invoice.model');
const invoiceService = require('../services/invoice.service');
const logger = require('../utils/logger');
const dayjs = require('dayjs');

const processDueRecurring = async (job) => {
  logger.info('[recurring-worker] Checking for due recurring invoices...');
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
      // Create new invoice from template
      const newInvoice = await invoiceService.duplicate(
        source._id,
        source.company.toString(),
        source.createdBy?.toString()
      );

      // Calculate next invoice date based on frequency
      const nextDate = calculateNextDate(source.recurringSettings.nextInvoiceDate || today, source.recurringSettings.frequency);

      // Update parent: increment cycles, set next date
      await Invoice.findByIdAndUpdate(source._id, {
        'recurringSettings.nextInvoiceDate': nextDate,
        'recurringSettings.lastGeneratedAt': new Date(),
        $inc: { 'recurringSettings.completedCycles': 1 },
      });

      // Auto-send if the template was in 'sent' state
      if (source.status === 'sent' && source.recipientEmail) {
        await invoiceService.sendInvoiceEmail(
          newInvoice._id.toString(),
          source.company.toString(),
          { recipientEmail: source.recipientEmail },
          source.createdBy?.toString()
        );
      }

      generated++;
      logger.info(`[recurring-worker] Generated recurring invoice: ${newInvoice.invoiceNumber}`);
    } catch (err) {
      logger.error(`[recurring-worker] Failed to generate recurring invoice from ${source._id}:`, err.message);
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

const startWorker = async () => {
  await connectDB();

  const worker = new Worker('recurring', processDueRecurring, {
    connection: getRedisConnection(),
    concurrency: 1,
  });

  worker.on('completed', (job, result) => {
    logger.info(`[recurring-worker] ✓ Done. Generated: ${result?.generated} of ${result?.processed}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[recurring-worker] ✗ Failed [${job?.id}]:`, err.message);
  });

  // Self-schedule: add next day's job when this one completes
  worker.on('completed', async () => {
    const recurringQueue = new Queue('recurring', { connection: getRedisConnection() });
    await recurringQueue.add('process-recurring', {}, {
      delay: 24 * 60 * 60 * 1000,  // run again in 24 hours
      jobId: `recurring-daily-${dayjs().add(1, 'day').format('YYYY-MM-DD')}`,
    });
  });

  logger.info('[recurring-worker] Recurring invoice worker started.');
};

startWorker().catch((err) => {
  logger.error('[recurring-worker] Failed to start:', err);
  process.exit(1);
});
