'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./lib/logger');

const boss = require('./queue/boss');
const { startWorkers } = require('./queue/workers');
const outboxDrain = require('./queue/outboxDrain');

const server = app.listen(config.PORT, async () => {
  logger.info({ port: config.PORT, app_env: config.APP_ENV }, 'YumYumTree API listening');

  // Bring the queue online AFTER the HTTP server is listening: register the pg-boss workers,
  // then start the outbox drain that feeds them. A failure here means orders would place but
  // never fan out — fail fast rather than serve a half-wired process.
  try {
    await startWorkers();
    outboxDrain.start();
  } catch (err) {
    logger.error({ err }, 'failed to start queue workers / outbox drain');
    process.exit(1);
  }
});

// Graceful shutdown: stop the drain, drain in-flight pg-boss work, then release the port.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  outboxDrain.stop();
  try {
    await boss.stop({ graceful: true });
  } catch (err) {
    logger.error({ err }, 'error stopping pg-boss');
  }
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
