const Redis = require('ioredis');
const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_URL } = require('./env');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Returns a singleton Redis client.
 * BullMQ requires separate connection instances — use getRedisConnection() for queues.
 */
const getRedisClient = () => {
  if (redisClient) return redisClient;

  const options = REDIS_URL
    ? REDIS_URL
    : {
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,   // required by BullMQ
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: false,
      };

  redisClient = new Redis(options);

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error', (err) => logger.error('Redis error:', err.message));
  redisClient.on('close', () => logger.warn('Redis connection closed'));

  return redisClient;
};

/**
 * BullMQ needs its own connection (not shared with app cache).
 * Call this whenever creating a Queue or Worker.
 */
const getRedisConnection = () => {
  const options = REDIS_URL
    ? REDIS_URL
    : {
        host: REDIS_HOST,
        port: REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };

  return new Redis(options);
};

module.exports = { getRedisClient, getRedisConnection };
