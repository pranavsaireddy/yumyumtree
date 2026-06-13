'use strict';

const logger = require('../lib/logger');

// Final error handler — mounted LAST. Emits the { error, code } contract with the right
// status, and logs the error (with stack, via pino's err serializer). Only method/path are
// logged alongside it — never request bodies, headers, or tokens.
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity (4 args).
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  logger.error({ err, status, method: req.method, path: req.path }, 'request failed');
  res.status(status).json({ error: err.message, code: err.code || 'INTERNAL' });
}

module.exports = errorHandler;
