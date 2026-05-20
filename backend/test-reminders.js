/**
 * End-to-End Reminder Test
 *
 * Tests the FULL reminder pipeline without waiting real days:
 *   1. Find (or create) a sent invoice
 *   2. Patch its dueDate to TODAY so "on_due_date" milestone fires immediately
 *   3. Run the cron sweep → jobs land in BullMQ reminder queue
 *   4. Print queue state BEFORE workers process jobs
 *   5. Wait for workers to process (poll ReminderLog for up to 30s)
 *   6. Print ReminderLog + EmailLog results
 *   7. Restore original dueDate
 *
 * PREREQUISITE: Workers must be running in another terminal:
 *   npm run workers          (all workers)
 *   -- OR --
 *   npm run worker:reminder  (terminal 1)
 *   npm run worker:email     (terminal 2)
 *
 * Run: node test-reminders.js
 *      npm run test:reminders
 */

require('dotenv').config();

const mongoose   = require('mongoose');
const connectDB  = require('./src/config/db');
const Invoice    = require('./src/models/Invoice.model');
const ReminderLog = require('./src/models/ReminderLog.model');
const EmailLog    = require('./src/models/EmailLog.model');
const { runOverdueReminders } = require('./src/jobs/overdueReminder.cron');
const { reminderQueue, emailQueue } = require('./src/config/queue');

// ─── Config ───────────────────────────────────────────────────────────────────
const POLL_TIMEOUT_MS  = 45_000; // how long to wait for workers
const POLL_INTERVAL_MS = 2_000;  // check every 2s
const SEP = '─'.repeat(60);

// ─── Helpers ─────────────────────────────────────────────────────────────────
const log   = (msg) => console.log(msg);
const ok    = (msg) => console.log(`  ✅ ${msg}`);
const warn  = (msg) => console.log(`  ⚠️  ${msg}`);
const fail  = (msg) => console.log(`  ❌ ${msg}`);
const info  = (msg) => console.log(`  ℹ️  ${msg}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Queue snapshot ───────────────────────────────────────────────────────────
const printQueueState = async (invoiceId) => {
  const [rWaiting, rDelayed, eWaiting] = await Promise.all([
    reminderQueue.getWaiting(),
    reminderQueue.getDelayed(),
    emailQueue.getWaiting(),
  ]);

  const myRJobs = [...rWaiting, ...rDelayed].filter(
    (j) => j.data?.invoiceId === invoiceId
  );
  const myEJobs = eWaiting.filter((j) => j.data?.invoiceId === invoiceId);

  log('\n📊 BullMQ queue state:');
  log(`   reminder queue — ${rWaiting.length} waiting, ${rDelayed.length} delayed`);
  if (myRJobs.length > 0) {
    myRJobs.forEach((j) => {
      const fireIn = j.opts?.delay ? ` (delay: ${(j.opts.delay / 1000).toFixed(0)}s)` : '';
      ok(`Reminder job queued: ${j.data.reminderType} [${j.id}]${fireIn}`);
    });
  } else {
    warn('No reminder jobs found for this invoice in queue');
  }

  log(`   email queue    — ${eWaiting.length} waiting`);
  if (myEJobs.length > 0) {
    myEJobs.forEach((j) => ok(`Email job queued: payment-reminder [${j.id}]`));
  }
};

// ─── Poll for completion ──────────────────────────────────────────────────────
const waitForEmail = async (invoiceId, deadline) => {
  log(`\n⏳ Waiting up to ${POLL_TIMEOUT_MS / 1000}s for workers to process jobs...`);
  info('Workers must be running: npm run workers');

  while (Date.now() < deadline) {
    const sentLog = await ReminderLog.findOne({
      invoice:      invoiceId,
      reminderType: 'on_due_date',
      status:       'sent',
    });
    if (sentLog) return sentLog;
    await sleep(POLL_INTERVAL_MS);
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return null;
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const run = async () => {
  await connectDB();
  log(`\n${SEP}`);
  log(' Reminder System — End-to-End Test');
  log(SEP);

  // ── 1. Find a suitable invoice ──────────────────────────────────────────
  log('\n1. Looking for a sent invoice with a recipient email...');

  const invoice = await Invoice.findOne({
    status:          'sent',
    recipientEmail:  { $exists: true, $ne: '' },
    reminderEnabled: { $ne: false },
  }).sort({ createdAt: -1 }).lean();

  if (!invoice) {
    fail('No eligible sent invoice found.');
    info('Create an invoice, send it to a real email address, then re-run this test.');
    process.exit(1);
  }

  ok(`Found invoice: ${invoice.invoiceNumber} (${invoice._id})`);
  info(`Recipient:    ${invoice.recipientEmail}`);
  info(`Status:       ${invoice.status}`);
  info(`Original due: ${invoice.dueDate ? new Date(invoice.dueDate).toDateString() : 'not set'}`);
  info(`Reminders:    enabled=${invoice.reminderEnabled !== false}`);

  const invoiceId = invoice._id.toString();

  // ── 2. Clear previous test ReminderLog entries for clean run ────────────
  const cleared = await ReminderLog.deleteMany({
    invoice:      invoice._id,
    reminderType: 'on_due_date',
  });
  if (cleared.deletedCount > 0) {
    info(`Cleared ${cleared.deletedCount} existing on_due_date ReminderLog entries (fresh test)`);
  }

  // ── 3. Patch dueDate to today ────────────────────────────────────────────
  log('\n2. Patching dueDate → today so "on_due_date" milestone fires...');
  const originalDueDate = invoice.dueDate;
  await Invoice.updateOne({ _id: invoice._id }, { dueDate: new Date() });
  ok(`dueDate patched to: ${new Date().toDateString()}`);

  // ── 4. Run the cron sweep ────────────────────────────────────────────────
  log('\n3. Running cron sweep (runOverdueReminders)...');
  await runOverdueReminders();
  ok('Cron sweep complete');

  // ── 5. Show queue state ──────────────────────────────────────────────────
  log(`\n4. Queue state after cron sweep:`);
  await printQueueState(invoiceId);

  // ── 6. Wait for workers to process ──────────────────────────────────────
  log('\n5. Waiting for reminder worker + email worker to process...');
  const deadline  = Date.now() + POLL_TIMEOUT_MS;
  const sentLog   = await waitForEmail(invoiceId, deadline);

  // ── 7. Print results ─────────────────────────────────────────────────────
  log(`\n${SEP}`);
  log(' Results');
  log(SEP);

  if (sentLog) {
    ok(`ReminderLog: on_due_date marked as "sent" at ${new Date(sentLog.createdAt).toLocaleString()}`);
  } else {
    fail('ReminderLog: on_due_date NOT sent within timeout');
    warn('Workers may not be running. Start them with: npm run workers');
  }

  const allLogs = await ReminderLog.find({ invoice: invoice._id }).sort({ createdAt: -1 }).lean();
  if (allLogs.length > 0) {
    log('\n  ReminderLog entries for this invoice:');
    for (const l of allLogs) {
      const icon = l.status === 'sent' ? '✅' : l.status === 'skipped' ? '⏭️ ' : '❌';
      log(`  ${icon}  ${l.reminderType} — ${l.status} at ${new Date(l.createdAt).toLocaleString()}`);
    }
  }

  const emailLogs = await EmailLog.find({ invoice: invoice._id })
    .sort({ createdAt: -1 }).limit(5).lean();
  if (emailLogs.length > 0) {
    log('\n  EmailLog entries (last 5):');
    for (const e of emailLogs) {
      const icon = e.status === 'sent' ? '✅' : e.status === 'failed' ? '❌' : '📋';
      log(`  ${icon}  ${e.type} — ${e.status} → ${e.to?.join(', ')} | subject: ${e.subject}`);
      if (e.status === 'failed') log(`      error: ${e.errorMessage}`);
    }
  } else {
    warn('No EmailLog entries found — email worker may not have processed the job yet');
  }

  // ── 8. Restore original dueDate ──────────────────────────────────────────
  log('\n6. Restoring original dueDate...');
  await Invoice.updateOne({ _id: invoice._id }, { dueDate: originalDueDate });
  ok(`dueDate restored to: ${originalDueDate ? new Date(originalDueDate).toDateString() : 'null'}`);

  log(`\n${SEP}`);
  if (sentLog && emailLogs.some((e) => e.type === 'payment_reminder' && e.status === 'sent')) {
    log(' ✅ END-TO-END TEST PASSED — email was sent successfully!');
  } else if (sentLog) {
    log(' ⚠️  PARTIAL — ReminderLog says sent, but no EmailLog entry found yet.');
    info('The email may still be in the queue. Check: npm run inspect:email');
  } else {
    log(' ❌ TEST FAILED — no reminder sent. Check workers are running and Redis is up.');
    info('Run workers:  npm run workers');
    info('Check queue:  npm run inspect');
  }
  log(SEP);
  log('');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('\nFatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
