'use strict';

// describe/it/expect/beforeAll are globals (vitest.config.js → test.globals).
const request = require('supertest');

const app = require('../../app');
const config = require('../../config');
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

  it('GET /readyz returns 200 with db:ok when the DEV database is reachable', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.db).toBe('ok');
    expect(res.body.app_env).toBe(config.APP_ENV);
  });
});
