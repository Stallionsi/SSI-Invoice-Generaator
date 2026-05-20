/**
 * Webhook Worker
 * Delivers signed webhook payloads to company-registered URLs.
 * HMAC-SHA256 signature for receiver verification.
 *
 * Standalone : node src/jobs/webhook.worker.js
 * Combined   : imported by src/jobs/worker.js
 */

require('dotenv').config();

const { Worker }   = require('bullmq');
const axios        = require('axios');
const crypto       = require('crypto');
const { getRedisConnection } = require('../config/redis');
const connectDB    = require('../config/db');
const Company      = require('../models/Company.model');
const { WEBHOOK_SECRET } = require('../config/env');
const logger       = require('../utils/logger');

// ─── Job processor ───────────────────────────────────────────────────────────
const processWebhook = async (job) => {
  const { event, data, companyId, timestamp } = job.data;
  logger.info(`[webhook-worker] ► Delivering ${event} for company ${companyId} [${job.id}]`);

  const company = await Company.findById(companyId).select('webhookUrl companyName').lean();
  if (!company?.webhookUrl) {
    logger.debug(`[webhook-worker] No webhookUrl for company ${companyId} — skipping`);
    return { skipped: true };
  }

  const payload   = { event, data, timestamp };
  const body      = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET || 'dev-secret')
    .update(body)
    .digest('hex');

  const response = await axios.post(company.webhookUrl, payload, {
    headers: {
      'Content-Type':        'application/json',
      'X-Webhook-Event':     event,
      'X-Webhook-Signature': `sha256=${signature}`,
      'X-Webhook-Timestamp': timestamp,
    },
    timeout: 10_000,
  });

  logger.info(
    `[webhook-worker] ✓ Delivered ${event} → ${company.webhookUrl} [HTTP ${response.status}]`
  );
  return { status: response.status };
};

// ─── Worker factory ───────────────────────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const worker = new Worker('webhook', processWebhook, {
    connection:  getRedisConnection(),
    concurrency: 5,
  });

  worker.on('completed', (job, result) => {
    if (!result?.skipped) {
      logger.info(
        `[webhook-worker] ✓ Completed ${job.data.event} [${job.id}] — HTTP ${result?.status}`
      );
    }
  });

  worker.on('failed', (job, err) => {
    const remaining = Math.max(0, (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0) - 1);
    logger.error(
      `[webhook-worker] ✗ Failed ${job?.data?.event} [${job?.id}] | ` +
      `${err.message} | retries left: ${remaining}`
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[webhook-worker] ⚠ Job stalled [${jobId}]`);
  });

  worker.on('error', (err) => {
    logger.error(`[webhook-worker] Worker-level error: ${err.message}`);
  });

  logger.info('[webhook-worker] ✓ Started — listening on queue "webhook"');
  return worker;
};

// ─── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  startWorker()
    .then((worker) => {
      const shutdown = async (signal) => {
        logger.info(`[webhook-worker] ${signal} received — closing gracefully...`);
        await worker.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('[webhook-worker] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { startWorker };
