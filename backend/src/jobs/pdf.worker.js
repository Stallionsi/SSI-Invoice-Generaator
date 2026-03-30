/**
 * PDF Worker
 * Processes jobs from the 'pdf' BullMQ queue.
 * Generates invoice PDFs using Puppeteer.
 *
 * Run: node src/jobs/pdf.worker.js
 */

require('dotenv').config();

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const connectDB = require('../config/db');
const pdfService = require('../services/pdf.service');
const logger = require('../utils/logger');

const processJob = async (job) => {
  const { invoiceId } = job.data;
  logger.info(`[pdf-worker] Generating PDF for invoice: ${invoiceId} [${job.id}]`);

  const pdfUrl = await pdfService.generateInvoicePdf(invoiceId);
  logger.info(`[pdf-worker] PDF ready: ${pdfUrl}`);
  return { pdfUrl };
};

const startWorker = async () => {
  await connectDB();

  const worker = new Worker('pdf', processJob, {
    connection: getRedisConnection(),
    concurrency: 2,  // Puppeteer is memory-heavy; keep concurrency low
  });

  worker.on('completed', (job, result) => {
    logger.info(`[pdf-worker] ✓ PDF generated [${job.id}]: ${result?.pdfUrl}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`[pdf-worker] ✗ PDF failed [${job?.id}]:`, err.message);
  });

  worker.on('error', (err) => {
    logger.error('[pdf-worker] Worker error:', err.message);
  });

  logger.info('[pdf-worker] PDF worker started. Waiting for jobs...');
};

startWorker().catch((err) => {
  logger.error('[pdf-worker] Failed to start:', err);
  process.exit(1);
});
