const Redis = require('ioredis');
const { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_URL } = require('./env');
const logger = require('../utils/logger');

let redisClient = null;

// Options applied to every ioredis instance used by BullMQ.
// maxRetriesPerRequest: null is REQUIRED — BullMQ throws if it's anything else.
// enableReadyCheck: false prevents BullMQ from stalling on Redis startup.
const BULLMQ_OPTS = {
  maxRetriesPerRequest: null,
  enableReadyCheck:     false,
  retryStrategy: (times) => Math.min(times * 500, 5_000),
};

/**
 * Singleton Redis client for general app use (caching, rate limiting, etc).
 * NOT used by BullMQ directly — BullMQ calls getRedisConnection() instead.
 */
const getRedisClient = () => {
  if (redisClient) return redisClient;

  redisClient = REDIS_URL
    ? new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        retryStrategy: (times) => Math.min(times * 50, 2_000),
        lazyConnect: false,
      })
    : new Redis({
        host:                 REDIS_HOST,
        port:                 REDIS_PORT,
        password:             REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        retryStrategy:        (times) => Math.min(times * 50, 2_000),
        lazyConnect:          false,
      });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error',   (err) => logger.error('Redis error:', err.message));
  redisClient.on('close',   () => logger.warn('Redis connection closed'));

  return redisClient;
};

/**
 * Creates a FRESH ioredis connection for BullMQ.
 * BullMQ requires each Queue and Worker to own its own connection —
 * they must NOT share a single client.
 *
 * The critical requirement: maxRetriesPerRequest MUST be null.
 * When REDIS_URL is a plain string, new Redis(url) uses the ioredis default (20).
 * We always pass it as new Redis(url, opts) or new Redis(opts) to enforce null.
 */
const getRedisConnection = () => {
  return REDIS_URL
    ? new Redis(REDIS_URL, BULLMQ_OPTS)
    : new Redis({
        host:     REDIS_HOST,
        port:     REDIS_PORT,
        password: REDIS_PASSWORD || undefined,
        ...BULLMQ_OPTS,
      });
};

module.exports = { getRedisClient, getRedisConnection };
