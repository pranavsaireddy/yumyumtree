'use strict';

const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // Globals (describe/it/expect/beforeAll) so CommonJS test files don't have to
    // import the ESM-only vitest API. apps/api is CommonJS end-to-end.
    globals: true,
    // Force the test app env so suites never run as 'development'/'production'.
    // dotenv (loaded in config.js) does not override an already-set process.env var,
    // so this wins over APP_ENV in .env.
    env: { APP_ENV: 'test' },
  },
});
