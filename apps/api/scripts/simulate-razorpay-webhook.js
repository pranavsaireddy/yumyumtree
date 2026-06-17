'use strict';

// simulate-razorpay-webhook.js — standalone CLI webhook simulator (S11A). The FIRST of the
// testing-strategy "simulator" power tools. Re-creates a Razorpay payment.captured webhook for a
// REAL order in the DEV DB: looks the order up, builds the exact payload, HMAC-signs it, and POSTs
// it to the local API's /payments/webhook — exactly as Razorpay would. The E2E suite shells out to
// this to drive an order pending_payment → placed without a real Razorpay account.
//
// Usage (paths are config-relative, so the cwd does not matter):
//   node scripts/simulate-razorpay-webhook.js --order <orderUuid>
//        [--event payment.captured] [--payment-id pay_xxx]
//
// SAFETY: assertSafeTestDb() runs FIRST (refuses APP_ENV=production / prod DB host) — the same
// guard the test harness uses. This script only READS the order (service-role) and POSTs a webhook;
// it never writes the DB directly.
//
// SIGNING (the S9 gotcha): we sign the EXACT JSON string and POST that SAME string — never a
// re-serialized Buffer/object — so the bytes the API verifies are the bytes we signed. `amount` is
// in PAISE here (round(total × 100)); that is the only place paise appears, matching the §6 edge.

const crypto = require('crypto');

const config = require('../src/config');
const supabase = require('../src/lib/supabase');
const { assertSafeTestDb } = require('../src/__tests__/setup');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--order') args.order = argv[(i += 1)];
    else if (a === '--event') args.event = argv[(i += 1)];
    else if (a === '--payment-id') args.paymentId = argv[(i += 1)];
  }
  return args;
}

function fail(message) {
  process.stderr.write(`simulate-razorpay-webhook: ${message}\n`);
  process.exit(1);
}

async function main() {
  // Refuse to run against production — before any DB access.
  assertSafeTestDb();

  const args = parseArgs(process.argv.slice(2));
  if (!args.order) fail('missing required --order <orderUuid>');

  const event = args.event || 'payment.captured';
  const paymentId = args.paymentId || `pay_test_${crypto.randomBytes(8).toString('hex')}`;

  const secret = config.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) fail('RAZORPAY_WEBHOOK_SECRET is not set — cannot sign the webhook');

  // Look the order up by id (service role; bypasses RLS). We need razorpay_order_id (what the
  // webhook keys on) and total (to compute the captured amount in paise).
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, razorpay_order_id, total')
    .eq('id', args.order)
    .maybeSingle();
  if (error) fail(`order lookup failed: ${error.message}`);
  if (!order) fail(`no order found with id ${args.order}`);
  if (!order.razorpay_order_id) fail(`order ${args.order} has no razorpay_order_id`);

  const amountPaise = Math.round(Number(order.total) * 100); // paise — the only paise in the app

  const payload = {
    event,
    payload: {
      payment: { entity: { id: paymentId, order_id: order.razorpay_order_id, amount: amountPaise } },
    },
  };

  // Sign the EXACT string we send. Do NOT re-serialize after signing.
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');

  const apiBase = process.env.API_BASE_URL || `http://localhost:${config.PORT}`;
  const url = `${apiBase}/payments/webhook`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
    body: raw, // the SAME string that was signed — fetch sends a string as-is
  });
  const text = await res.text();

  process.stdout.write(`POST ${url} → ${res.status}\n${text}\n`);

  if (res.status < 200 || res.status >= 300) process.exit(1);
  process.exit(0);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
