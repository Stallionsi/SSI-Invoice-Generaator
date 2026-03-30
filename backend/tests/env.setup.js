/**
 * Sets required environment variables BEFORE any module is loaded.
 * This runs via jest "setupFiles" — before the test framework is installed.
 */

// Generate deterministic keys for tests (64 hex chars = 32 bytes)
process.env.JWT_SECRET          = 'a'.repeat(64);
process.env.JWT_REFRESH_SECRET  = 'b'.repeat(64);
process.env.JWT_EXPIRES_IN      = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.WEBHOOK_SECRET      = 'test_webhook_secret_value';
process.env.APP_ENCRYPTION_KEY  = 'c'.repeat(64);
process.env.NODE_ENV            = 'test';
process.env.LOG_LEVEL           = 'silent'; // suppress Winston output during tests
