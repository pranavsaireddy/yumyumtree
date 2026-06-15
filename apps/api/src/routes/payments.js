'use strict';

const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const supabase = require('../lib/supabase');
const logger = require('../lib/logger');
const config = require('../config');
const razorpay = require('../services/razorpay');

// POST /payments/webhook — Razorpay's payment.captured → confirm_order (pending_payment→placed).
// FIRST WEBHOOK + SECOND money-path. Mounted in app.js with express.raw BEFORE express.json so
// the signature can be verified against the EXACT bytes Razorpay signed (architecture §8, gotcha
// #1). req.body here is a Buffer, never a parsed object.
//
// SECURITY / IDEMPOTENCY contract:
//   - Signature: HMAC-SHA256 of the raw body, timing-safe compare. Missing/invalid → 400, and
//     NOTHING downstream runs. This is the only status that is not 200.
//   - Three idempotency layers (§8): (1) the processed_webhooks pre-check below, (2) confirm_order's
//     own IF EXISTS guard, (3) the UNIQUE(source,event_id,event_type) constraint. A replay flips
//     state at most once.
//   - Amount: payment.amount (paise) must equal round(order.total × 100). Mismatch → do NOT confirm.
//   - After verification, every outcome returns 200 so Razorpay STOPS retrying — even the ones we
//     deliberately refuse to act on (orphan order, amount mismatch, non-captured event). Only a
//     pre-verification failure is a 4xx, because that traffic isn't trusted.
//   - NEVER log the secret, the signature, or the full PII payload.

const router = express.Router();

// We only act on a successful capture. Everything else is acknowledged and ignored this session
// (payment.failed → expiry/retry is reconcile's job, OUT OF SCOPE here).
const CAPTURED_EVENT = 'payment.captured';
const WEBHOOK_SOURCE = 'razorpay';

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // ── 1. VERIFY SIGNATURE against the raw bytes — the attack-surface line ──────────
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body; // Buffer, courtesy of express.raw

    const verified =
      Buffer.isBuffer(rawBody) &&
      razorpay.verifyWebhookSignature(rawBody, signature, config.RAZORPAY_WEBHOOK_SECRET);

    if (!verified) {
      // Warn WITHOUT the signature/secret/body — only that an unverified hit arrived.
      logger.warn({ hasSignature: Boolean(signature) }, 'razorpay webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid webhook signature', code: 'INVALID_SIGNATURE' });
    }

    // ── 2. PARSE the now-trusted bytes + pull the payment entity ─────────────────────
    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (_err) {
      // Signed by us but unparseable — refuse to act, but 200 so it isn't retried forever.
      logger.warn('razorpay webhook body verified but not valid JSON');
      return res.status(200).json({ status: 'ignored' });
    }

    const event = payload && payload.event;
    if (event !== CAPTURED_EVENT) {
      // Other events (payment.failed, order.paid, refunds, …) — acknowledge, no-op this session.
      return res.status(200).json({ status: 'ignored' });
    }

    const payment =
      payload.payload && payload.payload.payment && payload.payload.payment.entity;
    if (!payment || !payment.id || !payment.order_id) {
      logger.warn('razorpay payment.captured missing payment entity fields');
      return res.status(200).json({ status: 'ignored' });
    }

    // ── 3. DEDUP (layer 1): same (source, payment id, event) already processed → done ─
    // The dedup key mirrors confirm_order's internal guard, which keys on the payment id as
    // event_id. Keeping them identical is what makes the three layers one coherent key.
    const { data: seen, error: seenError } = await supabase
      .from('processed_webhooks')
      .select('id')
      .eq('source', WEBHOOK_SOURCE)
      .eq('event_id', payment.id)
      .eq('event_type', event)
      .maybeSingle();
    if (seenError) {
      const err = new Error('Failed to check webhook dedup');
      err.status = 500;
      err.code = 'WEBHOOK_DEDUP_FAILED';
      throw err;
    }
    if (seen) {
      return res.status(200).json({ status: 'already_processed' });
    }

    // ── 4. Look up the order by razorpay_order_id ────────────────────────────────────
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total, status')
      .eq('razorpay_order_id', payment.order_id)
      .maybeSingle();
    if (orderError) {
      const err = new Error('Failed to look up order');
      err.status = 500;
      err.code = 'ORDER_LOOKUP_FAILED';
      throw err;
    }
    if (!order) {
      // Orphan: a captured payment with no local order. Don't create anything — reconcile (a
      // later session) owns this gap. Ack so Razorpay stops retrying.
      logger.warn({ razorpayOrderId: payment.order_id }, 'razorpay webhook for unknown order (orphan)');
      return res.status(200).json({ status: 'orphan' });
    }

    // ── 5. AMOUNT CHECK: captured paise must equal the order total in paise ──────────
    const expectedPaise = Math.round(Number(order.total) * 100);
    if (payment.amount !== expectedPaise) {
      // Do NOT confirm a mismatched payment. Flag for manual review; ack to stop retries.
      logger.warn(
        { orderId: order.id, expectedPaise, capturedPaise: payment.amount },
        'razorpay webhook amount mismatch — not confirming'
      );
      return res.status(200).json({ status: 'amount_mismatch' });
    }

    // ── 6. CONFIRM atomically via confirm_order (mig 005). One transaction:
    //        processed_webhooks insert + dedup guard, pending_payment→placed,
    //        razorpay_payment_id, order_events, outbox. ─────────────────────────────
    const { error: rpcError } = await supabase.rpc('confirm_order', {
      p_order_id: order.id,
      p_payment_id: payment.id, // → processed_webhooks.event_id AND orders.razorpay_payment_id
      p_webhook_source: WEBHOOK_SOURCE,
      p_webhook_event: event,
      p_raw_payload: payload,
    });
    if (rpcError) {
      const err = new Error('Failed to confirm order');
      err.status = 500;
      err.code = 'ORDER_CONFIRM_FAILED';
      throw err;
    }

    // ── 7. Fast 200 ──────────────────────────────────────────────────────────────────
    return res.status(200).json({ status: 'ok' });
  })
);

module.exports = router;
