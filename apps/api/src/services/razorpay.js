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

const crypto = require('crypto');

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

/**
 * verifyWebhookSignature — confirm a Razorpay webhook came from Razorpay.
 *
 * SECURITY, not a mode toggle: this runs in BOTH 'mock' and 'live' modes. The mock only ever
 * stubbed order *creation*; an inbound webhook is real traffic on a real port and must be
 * authenticated either way. HMAC-SHA256 over the RAW request bytes (gotcha #1 — any re-parse
 * or re-serialize changes the bytes and breaks verification), compared TIMING-SAFE.
 *
 * @param {Buffer|string} rawBody   the unparsed request body (express.raw → Buffer)
 * @param {string}        signature the x-razorpay-signature header value (hex)
 * @param {string}        secret    config.RAZORPAY_WEBHOOK_SECRET
 * @returns {boolean} true only if the signature matches; false for missing secret/signature.
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  // No secret configured (CI / pre-integration) or no signature sent → cannot verify → reject.
  if (!secret || !signature) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(String(signature), 'utf8');

  // timingSafeEqual throws on length mismatch — guard first so a wrong-length sig is a clean
  // false, not an exception, and the comparison itself stays constant-time.
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { createOrder, verifyWebhookSignature, MODE };
