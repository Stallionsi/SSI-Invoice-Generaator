require('dotenv').config();

/**
 * Central environment config.
 * Import this instead of process.env directly anywhere in the app
 * so all env vars are validated at startup.
 */

const required = (key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return process.env[key];
};

const optional = (key, defaultValue = '') => process.env[key] || defaultValue;

module.exports = {
  // Server
  NODE_ENV:   optional('NODE_ENV', 'development'),
  PORT:       parseInt(optional('PORT', '5000'), 10),
  CLIENT_URL: optional('CLIENT_URL', 'http://localhost:3000'),

  // MongoDB
  MONGO_URI: optional('MONGO_URI', 'mongodb://localhost:27017/invoice_generator'),

  // JWT — no defaults; app fails fast if missing
  JWT_SECRET:              required('JWT_SECRET'),
  JWT_EXPIRES_IN:          optional('JWT_EXPIRES_IN', '1h'),
  JWT_REFRESH_SECRET:      required('JWT_REFRESH_SECRET'),
  JWT_REFRESH_EXPIRES_IN:  optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  // Redis — prefer REDIS_URL (Render/prod), fall back to individual vars (local dev)
  REDIS_URL:      optional('REDIS_URL', ''),
  REDIS_HOST:     optional('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT:     parseInt(optional('REDIS_PORT', '6379'), 10),
  REDIS_PASSWORD: optional('REDIS_PASSWORD', ''),

  // Email — Resend (primary)
  USE_RESEND:         optional('USE_RESEND', 'false') === 'true',
  RESEND_API_KEY:     optional('RESEND_API_KEY', ''),
  EMAIL_FROM_NAME:    optional('EMAIL_FROM_NAME', 'Invoice Generator'),
  EMAIL_FROM_ADDRESS: optional('EMAIL_FROM_ADDRESS', 'noreply@example.com'),

  // Email — SMTP (fallback / per-company override)
  SMTP_HOST:   optional('SMTP_HOST', 'smtp.gmail.com'),
  SMTP_PORT:   parseInt(optional('SMTP_PORT', '587'), 10),
  SMTP_SECURE: optional('SMTP_SECURE', 'false') === 'true',
  SMTP_USER:   optional('SMTP_USER'),
  SMTP_PASS:   optional('SMTP_PASS'),

  // PDF output directory
  UPLOAD_DIR: optional('UPLOAD_DIR', 'uploads'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(optional('RATE_LIMIT_WINDOW_MS', '900000'), 10),
  RATE_LIMIT_MAX:       parseInt(optional('RATE_LIMIT_MAX', '100'), 10),

  // Invoice numbering
  INVOICE_NUMBER_PREFIX:  optional('INVOICE_NUMBER_PREFIX', 'INV'),
  INVOICE_NUMBER_PADDING: parseInt(optional('INVOICE_NUMBER_PADDING', '6'), 10),

  // Currency
  DEFAULT_CURRENCY:       optional('DEFAULT_CURRENCY', 'INR'),
  EXCHANGE_RATE_API_KEY:  optional('EXCHANGE_RATE_API_KEY'),

  // Webhooks — required for HMAC signing
  WEBHOOK_SECRET: required('WEBHOOK_SECRET'),

  // Field-level encryption key — must be 64 hex chars (32 bytes)
  APP_ENCRYPTION_KEY: required('APP_ENCRYPTION_KEY'),

  // Logging
  LOG_LEVEL: optional('LOG_LEVEL', 'info'),
  LOG_DIR:   optional('LOG_DIR', 'logs'),
};
