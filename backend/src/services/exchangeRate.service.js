const axios = require('axios');
const { getRedisClient } = require('../config/redis');
const { EXCHANGE_RATE_API_KEY, DEFAULT_CURRENCY } = require('../config/env');
const logger = require('../utils/logger');

const CACHE_TTL_SECONDS = 86400; // 24 hours
const BASE_URL = 'https://v6.exchangerate-api.com/v6';

/**
 * Fetch all conversion rates for a given base currency from the API.
 * Returns the full rates map, e.g. { USD: 1, INR: 83.5, EUR: 0.92, ... }
 */
const fetchRatesFromApi = async (baseCurrency) => {
  if (!EXCHANGE_RATE_API_KEY) {
    throw Object.assign(
      new Error('EXCHANGE_RATE_API_KEY is not configured'),
      { statusCode: 503 }
    );
  }

  const url = `${BASE_URL}/${EXCHANGE_RATE_API_KEY}/latest/${baseCurrency}`;
  const { data } = await axios.get(url, { timeout: 8000 });

  if (data.result !== 'success') {
    throw Object.assign(
      new Error(`Exchange rate API error: ${data['error-type'] || 'unknown'}`),
      { statusCode: 502 }
    );
  }

  return data.conversion_rates; // { INR: 83.5, USD: 1, ... }
};

/**
 * Get all rates for a base currency, using Redis cache.
 * Cache key: exchange_rates:{baseCurrency}
 */
const getRatesForBase = async (baseCurrency) => {
  const redis    = getRedisClient();
  const cacheKey = `exchange_rates:${baseCurrency}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    logger.debug(`Exchange rates cache hit: ${cacheKey}`);
    return JSON.parse(cached);
  }

  logger.debug(`Exchange rates cache miss: ${cacheKey} — fetching from API`);
  const rates = await fetchRatesFromApi(baseCurrency);

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(rates));
  return rates;
};

/**
 * Get the exchange rate from one currency to another.
 *
 * Returns how many units of `toCurrency` equal 1 unit of `fromCurrency`.
 * Example: getExchangeRate('USD', 'INR') → 83.5  (1 USD = 83.5 INR)
 *
 * If both currencies are the same, returns 1.
 * Falls back to 1 if the API key is missing (development convenience).
 */
const getExchangeRate = async (fromCurrency, toCurrency) => {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1;

  try {
    // Fetch rates with fromCurrency as base — the target rate is a direct lookup
    const rates = await getRatesForBase(fromCurrency);
    const rate  = rates[toCurrency];

    if (!rate) {
      throw Object.assign(
        new Error(`Exchange rate not found for ${fromCurrency} → ${toCurrency}`),
        { statusCode: 422 }
      );
    }

    logger.debug(`Exchange rate ${fromCurrency}→${toCurrency}: ${rate}`);
    return rate;
  } catch (err) {
    // If API key is missing in dev, log a warning and fall back to 1
    if (!EXCHANGE_RATE_API_KEY) {
      logger.warn(`No EXCHANGE_RATE_API_KEY set — defaulting exchange rate to 1 for ${fromCurrency}→${toCurrency}`);
      return 1;
    }
    throw err;
  }
};

/**
 * Invalidate cached rates for a base currency (e.g. after manual override).
 */
const invalidateCache = async (baseCurrency = DEFAULT_CURRENCY) => {
  const redis = getRedisClient();
  await redis.del(`exchange_rates:${baseCurrency}`);
  logger.info(`Exchange rate cache invalidated for: ${baseCurrency}`);
};

module.exports = { getExchangeRate, getRatesForBase, invalidateCache };
