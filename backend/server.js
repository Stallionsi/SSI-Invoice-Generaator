/**
 * Invoice Generator — Server Entry Point
 *
 * Starts the Express HTTP server, connects to MongoDB,
 * initializes Redis, and warms up BullMQ queues.
 */

require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { PORT, NODE_ENV } = require('./src/config/env');
const logger = require('./src/utils/logger');
const { startOverdueCron } = require('./src/jobs/overdueReminder.cron');

const server = http.createServer(app);

const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectDB();

    // 2. Connect Redis (lazy — errors are logged by the client itself)
    require('./src/config/redis').getRedisClient();

    // 3. Start HTTP server
    server.listen(PORT, () => {
      logger.info(`Server running in ${NODE_ENV} mode on port ${PORT}`);
      logger.info(`API Base: http://localhost:${PORT}/api`);
    });

    // 4. Start scheduled cron jobs
    startOverdueCron();
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// ─── Graceful Shutdown ─────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    logger.info('MongoDB connection closed.');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();
