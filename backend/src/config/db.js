const mongoose = require('mongoose');
const { MONGO_URI, NODE_ENV } = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI, {
      // Connection pool — tune based on load
      maxPoolSize: 20,
      minPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // use IPv4
    });

    logger.info(`MongoDB connected: ${conn.connection.host}`);

    // Log slow queries in development
    if (NODE_ENV === 'development') {
      mongoose.set('debug', (collectionName, method, query, doc) => {
        logger.debug(`Mongoose: ${collectionName}.${method}`, { query, doc });
      });
    }
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB error:', err.message);
});

module.exports = connectDB;
