'use strict';

// Wraps an async route handler so a rejected promise is forwarded to Express's
// error handler instead of crashing the process as an unhandled rejection.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
