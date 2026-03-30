const { Worker } = require('bullmq');
const axios = require('axios');
const crypto = require('crypto');
const { getRedisConnection } = require('../config/redis');
const Company = require('../models/Company.model');
const { WEBHOOK_SECRET, NODE_ENV } = require('../config/env');
const logger = require('../utils/logger');

// Connect DB so the worker can query Company for the webhookUrl
require('../config/db').connectDB();

const worker = new Worker(
  'webhook',
  async (job) => {
    const { event, data, companyId, timestamp } = job.data;

    // Fetch the company's registered webhook URL
    const company = await Company.findById(companyId).select('webhookUrl companyName').lean();
    if (!company?.webhookUrl) {
      logger.debug(`Webhook skipped: no webhookUrl for company ${companyId}`);
      return { skipped: true };
    }

    const payload = { event, data, timestamp };
    const body    = JSON.stringify(payload);

    // HMAC-SHA256 signature so the receiver can verify authenticity
    const signature = crypto
      .createHmac('sha256', WEBHOOK_SECRET || 'dev-secret')
      .update(body)
      .digest('hex');

    const response = await axios.post(company.webhookUrl, payload, {
      headers: {
        'Content-Type':       'application/json',
        'X-Webhook-Event':    event,
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': timestamp,
      },
      timeout: 10000, // 10s timeout per attempt
    });

    logger.info(`Webhook delivered: ${event} → ${company.webhookUrl} [${response.status}]`);
    return { status: response.status };
  },
  {
    connection: getRedisConnection(),
    concurrency: 5,
  }
);

worker.on('completed', (job, result) => {
  if (!result?.skipped) {
    logger.info(`Webhook job completed: ${job.data.event} [${job.id}]`);
  }
});

worker.on('failed', (job, err) => {
  logger.error(`Webhook job failed: ${job?.data?.event} [${job?.id}] — ${err.message}`);
});

worker.on('error', (err) => {
  logger.error('Webhook worker error:', err);
});

logger.info('Webhook worker started');
module.exports = worker;
