'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./lib/logger');

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, app_env: config.APP_ENV }, 'YumYumTree API listening');
});

// Graceful shutdown so `node --watch` restarts and container stops release the port cleanly.
function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
