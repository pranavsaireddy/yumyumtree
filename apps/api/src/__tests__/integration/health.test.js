'use strict';

// describe/it/expect/beforeAll are globals (vitest.config.js → test.globals).
const request = require('supertest');

const app = require('../../app');
const config = require('../../config');
const workers = require('../../queue/workers');
const { assertSafeTestDb } = require('../setup');

describe('health endpoints', () => {
  beforeAll(() => {
    assertSafeTestDb();
  });

  it('GET /health returns 200 with the service identity', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', project: 'YumYumTree API' });
  });

  // DB-touching test. Skip ONLY when CI explicitly reports no DEV database, i.e.
  // CI_HAS_DEV_DB === 'false' (set by ci.yml when Supabase secrets are absent).
  //   - local dev  : CI_HAS_DEV_DB is undefined → !== 'false' → RUNS (real .env present)
  //   - CI + secrets: CI_HAS_DEV_DB === 'true'   → !== 'false' → RUNS
  //   - CI, no creds: CI_HAS_DEV_DB === 'false'  →             → SKIPS
  // The predicate keys on the explicit string 'false' (not falsiness) so an unset var
  // never skips the local developer's run.
  it.skipIf(process.env.CI_HAS_DEV_DB === 'false')('GET /readyz returns 200 with db:ok when the DEV database is reachable and the queue is up', async () => {
    // pg-boss is only started by server.js (never by the test harness), so stub the readiness
    // signal — otherwise /readyz correctly reports boss_started:false → 503. The DB round-trip
    // and the outbox count below are real.
    const spy = vi.spyOn(workers, 'isBossStarted').mockReturnValue(true);
    try {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(200);
      expect(res.body.db).toBe('ok');
      expect(res.body.boss_started).toBe(true);
      expect(typeof res.body.outbox_unprocessed).toBe('number');
      expect(res.body.app_env).toBe(config.APP_ENV);
    } finally {
      spy.mockRestore();
    }
  });

  it('GET /readyz returns 503 when pg-boss has not started', async () => {
    // Default test state: boss is never started. The DB may or may not be reachable, but a
    // down queue alone is enough to make the probe fail — a placed order would go nowhere.
    const spy = vi.spyOn(workers, 'isBossStarted').mockReturnValue(false);
    try {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.boss_started).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
