/**
 * Reminder Scheduler Cron — Daily Safety Net
 *
 * Runs daily at 09:00 AM. Acts as a catch-all for the BullMQ reminder system:
 *   - Covers invoices created before BullMQ scheduling was in place
 *   - Re-queues milestones missed due to server downtime or failed BullMQ jobs
 *   - Uses ReminderLog for idempotent dedup — each milestone fires exactly once
 *
 * The PRIMARY mechanism is BullMQ delayed jobs scheduled at invoice send time.
 * This cron is purely a safety net / backfill sweep.
 *
 * Milestones checked (relative to invoice dueDate):
 *   before_due_3days → dueDate − 3 days
 *   on_due_date      → dueDate
 *   after_due_3days  → dueDate + 3 days
 *   after_due_7days  → dueDate + 7 days
 *   after_due_14days → dueDate + 14 days
 *   after_due_30days → dueDate + 30 days
 */

const cron    = require('node-cron');
const Invoice = require('../models/Invoice.model');
const ReminderLog = require('../models/ReminderLog.model');
const { scheduleReminder } = require('../config/queue');
const logger  = require('../utils/logger');

// Milliseconds per day
const DAY_MS = 86_400_000;

// Each milestone: type string + how many days from dueDate (negative = before)
const MILESTONES = [
  { type: 'before_due_3days', offsetDays: -3 },
  { type: 'on_due_date',      offsetDays:  0 },
  { type: 'after_due_3days',  offsetDays:  3 },
  { type: 'after_due_7days',  offsetDays:  7 },
  { type: 'after_due_14days', offsetDays: 14 },
  { type: 'after_due_30days', offsetDays: 30 },
];

const SKIP_STATUSES = ['paid', 'cancelled'];

// Tolerance window: consider a milestone "due" if it fell within the past N hours.
// 36 hours catches a missed previous day's run without double-firing on the same day.
const WINDOW_HOURS = 36;

/**
 * Core sweep — exported for tests and on-demand execution.
 */
const runOverdueReminders = async () => {
  logger.info('[reminder-cron] Starting daily milestone sweep...');

  const now = new Date();
  let queued  = 0;
  let skipped = 0;

  for (const { type, offsetDays } of MILESTONES) {
    // Milestone fires at: dueDate + offsetDays
    // We consider it "due today" when: (dueDate + offsetDays) is in (now - WINDOW_HOURS, now]
    // Rearranging for dueDate: dueDate is in (now - WINDOW_HOURS - offsetDays days, now - offsetDays days]
    const windowMs   = WINDOW_HOURS * 3_600_000;
    const offsetMs   = offsetDays * DAY_MS;
    const dueDateFrom = new Date(now.getTime() - windowMs - offsetMs);
    const dueDateTo   = new Date(now.getTime()             - offsetMs);

    const invoices = await Invoice.find({
      status:          { $nin: SKIP_STATUSES },
      reminderEnabled: { $ne: false },
      dueDate:         { $gte: dueDateFrom, $lte: dueDateTo },
      recipientEmail:  { $exists: true, $ne: '' },
    }).select('_id company').lean();

    if (invoices.length === 0) continue;

    // Bulk-fetch already-sent ReminderLog entries for this milestone to avoid N+1 queries
    const invoiceIds = invoices.map((i) => i._id);
    const sentLogs   = await ReminderLog.find({
      invoice:      { $in: invoiceIds },
      reminderType: type,
      status:       'sent',
    }).select('invoice').lean();
    const sentSet = new Set(sentLogs.map((l) => l.invoice.toString()));

    for (const invoice of invoices) {
      const id = invoice._id.toString();
      if (sentSet.has(id)) {
        skipped++;
        continue;
      }

      // Queue immediately (delay: 0) — milestone is already due
      await scheduleReminder(
        { invoiceId: id, reminderType: type, companyId: invoice.company?.toString() },
        0,
      );
      queued++;
      logger.info(`[reminder-cron] Queued ${type} for invoice ${id}`);
    }
  }

  logger.info(`[reminder-cron] Sweep complete — queued: ${queued}, already-sent skipped: ${skipped}`);
};

/**
 * Schedule the cron — call once at server startup.
 * Also runs one immediate sweep so invoices that became overdue while the
 * server was down (or were sent outside the 09:00 window) are caught right away.
 */
const startOverdueCron = () => {
  cron.schedule('0 9 * * *', async () => {
    try {
      await runOverdueReminders();
    } catch (err) {
      logger.error('[reminder-cron] Unhandled error in cron run:', err.message);
    }
  });

  // Startup sweep — runs once after a short delay to let DB connections settle.
  // This covers the gap between the last 09:00 run and server restart.
  setTimeout(async () => {
    try {
      logger.info('[reminder-cron] Running startup catch-up sweep...');
      await runOverdueReminders();
    } catch (err) {
      logger.error('[reminder-cron] Startup sweep error:', err.message);
    }
  }, 5_000);

  logger.info('[reminder-cron] Reminder cron scheduled — daily at 09:00 + startup sweep in 5s.');
};

module.exports = { startOverdueCron, runOverdueReminders };
