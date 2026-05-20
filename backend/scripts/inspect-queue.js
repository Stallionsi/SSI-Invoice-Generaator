/**
 * Queue Inspector
 * Print a snapshot of all BullMQ queue states — waiting, delayed, active,
 * recent completions, recent failures.
 *
 * Run from backend/: node scripts/inspect-queue.js [queue-name]
 *   node scripts/inspect-queue.js           → all queues
 *   node scripts/inspect-queue.js reminder  → reminder queue only
 *   node scripts/inspect-queue.js email     → email queue only
 */

require('dotenv').config();

const { Queue }  = require('bullmq');
const { getRedisConnection } = require('../src/config/redis');

const TARGET = process.argv[2] || 'all';

const QUEUE_NAMES = ['reminder', 'email', 'pdf', 'recurring', 'webhook'];

const pad   = (s, n) => String(s).padEnd(n);
const ms2s  = (ms)   => ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
const fdate = (ts)   => ts ? new Date(ts).toLocaleString() : '—';

const inspectQueue = async (name) => {
  const queue = new Queue(name, { connection: getRedisConnection() });

  const [waiting, delayed, active, completed, failed, counts] = await Promise.all([
    queue.getWaiting(0, 20),
    queue.getDelayed(0, 20),
    queue.getActive(0, 20),
    queue.getCompleted(0, 10),
    queue.getFailed(0, 10),
    queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed', 'paused'),
  ]);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(` Queue: ${name.toUpperCase()}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(
    ` Waiting: ${counts.waiting}  ` +
    `Delayed: ${counts.delayed}  ` +
    `Active: ${counts.active}  ` +
    `Completed: ${counts.completed}  ` +
    `Failed: ${counts.failed}`
  );

  // ── Delayed jobs (most important for reminders) ──
  if (delayed.length > 0) {
    console.log('\n  ⏳ Delayed jobs (next to fire):');
    const sorted = [...delayed].sort((a, b) =>
      (a.timestamp + (a.opts?.delay || 0)) - (b.timestamp + (b.opts?.delay || 0))
    );
    for (const job of sorted) {
      const fireAt = new Date(job.timestamp + (job.opts?.delay || 0));
      const inMs   = fireAt.getTime() - Date.now();
      const inStr  = inMs > 0 ? `in ${ms2s(inMs)}` : 'OVERDUE';
      const label  = job.data?.reminderType || job.data?.event || job.name || '?';
      const inv    = job.data?.invoiceId ? ` → invoice ${job.data.invoiceId}` : '';
      console.log(
        `    [${pad(job.id, 24)}] ${pad(label, 20)} fires ${fireAt.toLocaleString()} (${inStr})${inv}`
      );
    }
  }

  // ── Waiting jobs ──
  if (waiting.length > 0) {
    console.log('\n  ⏸  Waiting jobs (ready to process):');
    for (const job of waiting) {
      const label = job.data?.reminderType || job.data?.event || job.name || '?';
      const inv   = job.data?.invoiceId ? ` → invoice ${job.data.invoiceId}` : '';
      console.log(`    [${pad(job.id, 24)}] ${label}${inv}`);
    }
  }

  // ── Active jobs ──
  if (active.length > 0) {
    console.log('\n  🔄 Active (currently processing):');
    for (const job of active) {
      console.log(`    [${job.id}] ${job.name} — attempt ${(job.attemptsMade || 0) + 1}`);
    }
  }

  // ── Recent failures ──
  if (failed.length > 0) {
    console.log('\n  ❌ Recent failures:');
    for (const job of failed) {
      const label = job.data?.reminderType || job.data?.event || job.name || '?';
      const inv   = job.data?.invoiceId ? ` → invoice ${job.data.invoiceId}` : '';
      console.log(`    [${pad(job.id, 24)}] ${label}${inv}`);
      console.log(`       reason: ${job.failedReason || 'unknown'}`);
      console.log(`       attempts: ${job.attemptsMade}`);
    }
  }

  // ── Recent completions ──
  if (completed.length > 0) {
    console.log('\n  ✅ Recent completions (last 10):');
    for (const job of completed.slice(0, 5)) {
      const label = job.data?.reminderType || job.data?.event || job.name || '?';
      const inv   = job.data?.invoiceId ? ` → invoice ${job.data.invoiceId}` : '';
      console.log(`    [${pad(job.id, 24)}] ${label}${inv}`);
    }
  }

  await queue.close();
};

const main = async () => {
  const names = TARGET === 'all'
    ? QUEUE_NAMES
    : QUEUE_NAMES.filter((n) => n === TARGET);

  if (names.length === 0) {
    console.error(`Unknown queue: "${TARGET}". Valid: ${QUEUE_NAMES.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nQueue snapshot — ${new Date().toLocaleString()}`);
  if (TARGET !== 'all') console.log(`Filtering to queue: ${TARGET}`);

  for (const name of names) {
    await inspectQueue(name);
  }

  console.log('\n');
  process.exit(0);
};

main().catch((err) => {
  console.error('Inspector error:', err.message);
  process.exit(1);
});
