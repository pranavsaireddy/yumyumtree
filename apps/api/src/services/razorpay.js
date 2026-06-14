'use strict';

// Razorpay service — THE SEAM (same pattern as services/petpooja.js). Today it returns a
// fake order in 'mock' mode; the real Razorpay Orders API lands in a later session, which
// will replace the 'live' branch only. Nothing else in the app changes.
//
// Mode flag: MODE comes from config.RAZORPAY_MODE, defaults to 'mock' because TEST-MODE
// keys aren't wired yet. 'live' is intentionally a hard 501 — never a silent fallback.
//
// MONEY EDGE: amount is in PAISE here (integer rupees × 100). This is the ONLY layer that
// speaks paise; the DB and the rest of the domain are in rupees (architecture conventions).

const config = require('../config');

const MODE = config.RAZORPAY_MODE || 'mock';

function notImplemented() {
  const err = new Error('Razorpay live mode is not implemented yet');
  err.status = 501;
  err.code = 'NOT_IMPLEMENTED';
  return err;
}

/**
 * createOrder — create a Razorpay order to back a checkout.
 * @param {{ amount: number, receipt: string }} params  amount in PAISE (integer), receipt = our idempotency key
 * @returns {Promise<{ id: string, amount: number, currency: string, status: string }>}
 */
async function createOrder({ amount, receipt }) {
  if (MODE === 'live') {
    throw notImplemented();
  }

  // Mock: a plausible Razorpay order object. The id mirrors the real `order_...` prefix so
  // the frontend code path is exercised; the random suffix keeps ids distinct per call.
  const suffix = Math.random().toString(36).slice(2, 12);
  return {
    id: `order_mock_${suffix}`,
    amount,
    currency: 'INR',
    status: 'created',
    receipt,
  };
}

module.exports = { createOrder, MODE };
