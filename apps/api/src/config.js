'use strict';

const path = require('path');

// Load apps/api/.env regardless of the process's working directory.
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// DATABASE_URL is REQUIRED from S10 on: pg-boss (queue/boss.js) connects with it directly.
const REQUIRED = ['PORT', 'FRONTEND_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_ENV', 'DATABASE_URL'];
const VALID_APP_ENVS = ['development', 'test', 'production'];

// Architecture §11 — read as optional this session; one warning lists any that are absent.
const OPTIONAL = [
  'PETPOOJA_MODE',
  'RAZORPAY_MODE',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'PETPOOJA_API_KEY',
  'PETPOOJA_API_SECRET',
  'PETPOOJA_APP_KEY',
  'PETPOOJA_RESTAURANT_ID',
  'SHADOWFAX_CLIENT_CODE',
  'SHADOWFAX_API_KEY',
  'SHADOWFAX_PICKUP_LAT',
  'SHADOWFAX_PICKUP_LNG',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_VERIFY_TOKEN',
  'SENTRY_DSN',
];

const isBlank = (key) => process.env[key] === undefined || String(process.env[key]).trim() === '';

const problems = [];

for (const key of REQUIRED) {
  if (isBlank(key)) problems.push(`Missing required env var: ${key}`);
}

const appEnv = process.env.APP_ENV;
if (!isBlank('APP_ENV') && !VALID_APP_ENVS.includes(appEnv)) {
  problems.push(`APP_ENV must be one of {${VALID_APP_ENVS.join(', ')}} (got "${appEnv}")`);
}

// pg-boss needs DDL privileges and steady, long-lived sessions. Supabase's TRANSACTION POOLER
// (port 6543) provides neither — it multiplexes short-lived sessions and forbids the schema/
// prepared-statement behaviour pg-boss relies on. Refuse it explicitly rather than failing
// later at boss.start() with an opaque error.
if (!isBlank('DATABASE_URL') && String(process.env.DATABASE_URL).includes(':6543')) {
  problems.push(
    'DATABASE_URL points at the Supabase transaction pooler (:6543). pg-boss requires the ' +
      'DIRECT connection — use the port 5432 string (Supabase → Database → Connection string → Direct).'
  );
}

// V2 Patch C2 — refuse to run a production app under a non-production Node runtime.
if (appEnv === 'production' && process.env.NODE_ENV !== 'production') {
  problems.push('APP_ENV=production requires NODE_ENV=production');
}

if (problems.length > 0) {
  // The logger depends on this module, so it cannot be used here. Write directly to
  // stderr (not console.log) and fail fast — there is no safe partial config.
  process.stderr.write('FATAL: invalid backend configuration:\n');
  for (const p of problems) process.stderr.write(`  - ${p}\n`);
  process.exit(1);
}

const config = Object.freeze({
  PORT: Number(process.env.PORT),
  FRONTEND_URL: process.env.FRONTEND_URL,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  APP_ENV: process.env.APP_ENV,
  NODE_ENV: process.env.NODE_ENV,
  // Direct Postgres connection string for pg-boss (S10). Required; never the :6543 pooler.
  DATABASE_URL: process.env.DATABASE_URL,
  // External-provider mode flag (the template every partner copies). Optional, defaults
  // to 'mock' at the consuming service since PetPooja creds don't exist yet (real sync = S21).
  PETPOOJA_MODE: process.env.PETPOOJA_MODE,
  // Razorpay mode flag — same seam pattern. Optional; the razorpay service defaults to
  // 'mock' since TEST-MODE keys aren't wired yet. 'live' is a hard 501 until the real
  // integration session.
  RAZORPAY_MODE: process.env.RAZORPAY_MODE,
  // Razorpay secrets. Optional this session (CI has no secret); the webhook handler warns
  // and rejects every signature if RAZORPAY_WEBHOOK_SECRET is absent. NEVER logged.
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
});

// Safe to require the logger now that config is valid (logger reads only APP_ENV, no cycle).
const missingOptional = OPTIONAL.filter(isBlank);
if (missingOptional.length > 0) {
  require('./lib/logger').warn(
    { missing: missingOptional },
    'optional env vars not set (expected during platform work)'
  );
}

module.exports = config;
