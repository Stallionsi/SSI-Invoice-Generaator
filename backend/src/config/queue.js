const { Queue } = require('bullmq');
const { getRedisConnection } = require('./redis');
const logger = require('../utils/logger');

/**
 * BullMQ Queue definitions
 * Each queue runs in its own worker process for isolation
 */

const defaultJobOptions = {
  removeOnComplete: { count: 100 },     // keep last 100 completed
  removeOnFail: { count: 200 },          // keep last 200 failed for debugging
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,                          // 5s, 10s, 20s
  },
};

// ─── Queue: Email Sending ─────────────────────────────────────────────────
const emailQueue = new Queue('email', {
  connection: getRedisConnection(),
  defaultJobOptions,
});

// ─── Queue: PDF Generation ────────────────────────────────────────────────
const pdfQueue = new Queue('pdf', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 2,
  },
});

// ─── Queue: Payment Reminders ─────────────────────────────────────────────
const reminderQueue = new Queue('reminder', {
  connection: getRedisConnection(),
  defaultJobOptions,
});

// ─── Queue: Recurring Invoice Generation ─────────────────────────────────
const recurringQueue = new Queue('recurring', {
  connection: getRedisConnection(),
  defaultJobOptions,
});

// ─── Queue: Webhooks ──────────────────────────────────────────────────────
const webhookQueue = new Queue('webhook', {
  connection: getRedisConnection(),
  defaultJobOptions: {
    ...defaultJobOptions,
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
});

// ─── Helper: Add email job ────────────────────────────────────────────────
const addEmailJob = async (jobName, data, opts = {}) => {
  const job = await emailQueue.add(jobName, data, opts);
  logger.debug(`Email job added: ${jobName} [${job.id}]`);
  return job;
};

// ─── Helper: Add PDF job ──────────────────────────────────────────────────
const addPdfJob = async (invoiceId, opts = {}) => {
  const job = await pdfQueue.add('generate-pdf', { invoiceId }, opts);
  logger.debug(`PDF job added for invoice: ${invoiceId} [${job.id}]`);
  return job;
};

// ─── Helper: Schedule reminder ────────────────────────────────────────────
const scheduleReminder = async (data, delay) => {
  const job = await reminderQueue.add('send-reminder', data, {
    delay,
    jobId: `reminder-${data.invoiceId}-${data.reminderType}`, // prevent duplicates
  });
  logger.debug(`Reminder scheduled: ${data.reminderType} for invoice ${data.invoiceId} [delay: ${delay}ms]`);
  return job;
};

// ─── Helper: Add webhook job ──────────────────────────────────────────────
const addWebhookJob = async (event, data, companyId) => {
  const job = await webhookQueue.add('send-webhook', { event, data, companyId: companyId?.toString(), timestamp: new Date() });
  logger.debug(`Webhook job added: ${event} for company ${companyId} [${job.id}]`);
  return job;
};

// ─── Helper: Cancel a single scheduled reminder ───────────────────────────
const ALL_REMINDER_TYPES = [
  'before_due_3days',
  'on_due_date',
  'after_due_3days',
  'after_due_7days',
  'after_due_14days',
  'after_due_30days',
];

const cancelReminder = async (invoiceId, reminderType) => {
  const jobId = `reminder-${invoiceId}-${reminderType}`;
  try {
    const job = await reminderQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'delayed' || state === 'waiting') {
        await job.remove();
        logger.debug(`Reminder cancelled: ${jobId}`);
      }
    }
  } catch (err) {
    // Non-fatal — job may have already fired or been removed
    logger.warn(`Could not cancel reminder ${jobId}: ${err.message}`);
  }
};

// ─── Helper: Cancel ALL pending reminders for an invoice ─────────────────
const cancelAllReminders = async (invoiceId) => {
  await Promise.all(ALL_REMINDER_TYPES.map((type) => cancelReminder(invoiceId, type)));
  logger.debug(`All pending reminders cancelled for invoice ${invoiceId}`);
};

module.exports = {
  emailQueue,
  pdfQueue,
  reminderQueue,
  recurringQueue,
  webhookQueue,
  addEmailJob,
  addPdfJob,
  scheduleReminder,
  cancelReminder,
  cancelAllReminders,
  addWebhookJob,
};
