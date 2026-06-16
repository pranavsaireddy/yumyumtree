'use strict';

// pg-boss singleton (architecture §9). One PgBoss per process, shared by the worker
// registrations (queue/workers.js) and the outbox drain (queue/outboxDrain.js).
//
// Constructing PgBoss does NOT open a connection — that happens at boss.start() (called from
// server.js). So requiring this module is cheap and side-effect-free, which is why the tests
// and /readyz can pull it in without a live database.
//
// pg-boss v12 exports the constructor as a NAMED export ({ PgBoss }), not the default.

const { PgBoss } = require('pg-boss');

const config = require('../config');
const logger = require('../lib/logger');

const boss = new PgBoss(config.DATABASE_URL);

// Background errors (lost connections, pool errors) surface here, not as throws. Log via pino.
boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));

module.exports = boss;
