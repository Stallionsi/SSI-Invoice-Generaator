module.exports = {
  testEnvironment:        'node',
  setupFiles:             ['./tests/env.setup.js'],   // set process.env before modules load
  globalSetup:            './tests/global.setup.js',  // start MongoMemoryServer
  globalTeardown:         './tests/global.teardown.js',
  setupFilesAfterFramework: ['./tests/setup.js'],      // connect mongoose per-suite
  testMatch:              ['**/tests/**/*.test.js'],
  testTimeout:            30000,
  verbose:                true,
  // Suppress noisy console logs from workers during tests
  silent:                 false,
};
