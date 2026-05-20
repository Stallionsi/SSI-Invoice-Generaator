/**
 * PDF Worker
 * Processes jobs from the 'pdf' BullMQ queue.
 * Generates invoice PDFs on demand.
 *
 * Standalone : node src/jobs/pdf.worker.js
 * Combined   : imported by src/jobs/worker.js
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB    = require('../config/db');
const pdfService   = require('../services/pdf.service');
const logger       = require('../utils/logger');

// ─── Job processor ───────────────────────────────────────────────────────────
const processJob = async (job) => {
  const { invoiceId } = job.data;
  logger.info(`[pdf-worker] ► Generating PDF for invoice ${invoiceId} [${job.id}]`);

  const pdfUrl = await pdfService.generateInvoicePdf(invoiceId);
  logger.info(`[pdf-worker] ✓ PDF ready: ${pdfUrl}`);
  return { pdfUrl };
};

// ─── Worker factory ───────────────────────────────────────────────────────────
const startWorker = async () => {
  await connectDB();

  const worker = new Worker('pdf', processJob, {
    connection:  getRedisConnection(),
    concurrency: 2, // PDFKit is memory-heavy — keep low
  });

  worker.on('completed', (job, result) => {
    logger.info(`[pdf-worker] ✓ Completed [${job.id}]: ${result?.pdfUrl}`);
  });

  worker.on('failed', (job, err) => {
    const remaining = Math.max(0, (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 0) - 1);
    logger.error(
      `[pdf-worker] ✗ Failed [${job?.id}] — invoice ${job?.data?.invoiceId} | ` +
      `${err.message} | retries left: ${remaining}`
    );
  });

  worker.on('stalled', (jobId) => {
    logger.warn(`[pdf-worker] ⚠ Job stalled [${jobId}] — BullMQ will retry automatically`);
  });

  worker.on('error', (err) => {
    logger.error(`[pdf-worker] Worker-level error: ${err.message}`);
  });

  logger.info('[pdf-worker] ✓ Started — listening on queue "pdf"');
  return worker;
};

// ─── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  startWorker()
    .then((worker) => {
      const shutdown = async (signal) => {
        logger.info(`[pdf-worker] ${signal} received — closing gracefully...`);
        await worker.close();
        process.exit(0);
      };
      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT',  () => shutdown('SIGINT'));
    })
    .catch((err) => {
      logger.error('[pdf-worker] Failed to start:', err.message);
      process.exit(1);
    });
}

module.exports = { startWorker };
