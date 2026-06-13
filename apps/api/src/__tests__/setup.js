'use strict';

const config = require('../config');

// V2 Patch T2 — production fencing for tests and simulators.
// Every suite that touches the database MUST call this in beforeAll. It refuses to run
// when:
//   1. APP_ENV === 'production', or
//   2. the configured Supabase host equals PROD_DB_HOST.
// PROD_DB_HOST is introduced at Session 14A, so its absence is tolerated here — when it
// is unset the host check is simply skipped.
function assertSafeTestDb() {
  if (config.APP_ENV === 'production') {
    throw new Error('assertSafeTestDb: refusing to run tests with APP_ENV=production');
  }

  const prodHost = process.env.PROD_DB_HOST;
  if (prodHost && prodHost.trim() !== '') {
    const host = new URL(config.SUPABASE_URL).host;
    if (host === prodHost.trim()) {
      throw new Error(`assertSafeTestDb: refusing to run tests against production DB host: ${host}`);
    }
  }
}

module.exports = { assertSafeTestDb };
