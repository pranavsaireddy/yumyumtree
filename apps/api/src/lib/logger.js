'use strict';

const pino = require('pino');

// pino-pretty transport ONLY outside production. APP_ENV is read directly from the
// environment (not from ./config) so the logger has no dependency on config — config
// itself uses this logger to emit its optional-vars warning.
const isProduction = process.env.APP_ENV === 'production';

const logger = pino(
  isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } } }
);

module.exports = logger;
