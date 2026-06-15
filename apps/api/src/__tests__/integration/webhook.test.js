'use strict';

// MUST run before app/config are required: config freezes RAZORPAY_WEBHOOK_SECRET at load time
// from process.env, and dotenv does not override an already-set var. Each test file gets its own
// module registry (vitest isolate), so this secret is the one the handler verifies against.
const WEBHOOK_SECRET = 'whsec_test_s09_abcdef';
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

// describe/it/expect/vi/afterEach are globals (vitest.config.js → test.globals).
const crypto = require('crypto');
const request = require('supertest');

const app = require('../../app');
const supabase = require('../../lib/supabase');

// Pure HTTP against POST /payments/webhook with the Supabase client mocked. The signature
// verification is NOT mocked — every "valid" request below carries a real HMAC computed with
// the same secret the handler uses, so a broken verifier would fail these tests.

const ORDER_UUID = 'order-uuid-1';
const RZP_ORDER_ID = 'order_mock_abcdef0123';
const PAYMENT_ID = 'pay_test_0001';

// A pending_payment order whose ₹998 total matches a 99800-paise capture.
const DEFAULT_ORDER = { id: ORDER_UUID, total: 998, status: 'pending_payment' };

function makePayload({
  event = 'payment.captured',
  paymentId = PAYMENT_ID,
  orderId = RZP_ORDER_ID,
  amount = 99800,
} = {}) {
  return { event, payload: { payment: { entity: { id: paymentId, order_id: orderId, amount } } } };
}

// Returns the exact JSON string to send AND the real signature over those bytes. We sign and send
// a STRING (not a Buffer): superagent leaves strings untouched but would re-serialize a Buffer
// under a JSON content-type, which would change the bytes and break verification.
function sign(payload, secret = WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');
  return { raw, signature };
}

// Send a raw JSON string with an explicit application/json content-type so express.raw captures
// it as the exact Buffer the signature was computed over.
function post(raw, signature) {
  const req = request(app).post('/payments/webhook').set('Content-Type', 'application/json');
  if (signature !== undefined) req.set('x-razorpay-signature', signature);
  return req.send(raw);
}

function installMocks({ seen = null, order = DEFAULT_ORDER, rpcError = null } = {}) {
  vi.spyOn(supabase, 'from').mockImplementation((table) => {
    if (table === 'processed_webhooks') {
      const q = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.maybeSingle = vi.fn(() => Promise.resolve({ data: seen, error: null }));
      return q;
    }
    if (table === 'orders') {
      const q = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.maybeSingle = vi.fn(() => Promise.resolve({ data: order, error: null }));
      return q;
    }
    throw new Error(`unexpected table in test: ${table}`);
  });
  const rpcSpy = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: null, error: rpcError });
  return { rpcSpy };
}

describe('POST /payments/webhook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('400 INVALID_SIGNATURE on a wrong signature — confirm_order never called', async () => {
    const { rpcSpy } = installMocks();
    const { raw } = sign(makePayload());

    const res = await post(raw, 'deadbeef'); // not the real HMAC
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('400 INVALID_SIGNATURE when the x-razorpay-signature header is missing', async () => {
    const { rpcSpy } = installMocks();
    const { raw } = sign(makePayload());

    const res = await post(raw, undefined); // no signature header
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('400 when the body is tampered after signing — proves verification is over the raw bytes', async () => {
    const { rpcSpy } = installMocks();
    const { signature } = sign(makePayload());
    const tampered = JSON.stringify(makePayload({ amount: 1 }));

    const res = await post(tampered, signature); // signature is for the original body
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('200 and confirms the order once with the right params on a valid payment.captured', async () => {
    const { rpcSpy } = installMocks();
    const payload = makePayload();
    const { raw, signature } = sign(payload);

    const res = await post(raw, signature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [fn, params] = rpcSpy.mock.calls[0];
    expect(fn).toBe('confirm_order');
    expect(params).toEqual({
      p_order_id: ORDER_UUID,
      p_payment_id: PAYMENT_ID,
      p_webhook_source: 'razorpay',
      p_webhook_event: 'payment.captured',
      p_raw_payload: payload,
    });
  });

  it('replay (already in processed_webhooks) → 200 already_processed, confirm_order not called', async () => {
    const { rpcSpy } = installMocks({ seen: { id: 'pw-1' } });
    const { raw, signature } = sign(makePayload());

    const res = await post(raw, signature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('already_processed');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('amount mismatch → 200 amount_mismatch, order NOT confirmed', async () => {
    const { rpcSpy } = installMocks(); // order.total ₹998 → expects 99800 paise
    const { raw, signature } = sign(makePayload({ amount: 50000 })); // captured ₹500, mismatch

    const res = await post(raw, signature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('amount_mismatch');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('unknown razorpay_order_id → 200 orphan, nothing confirmed or created', async () => {
    const { rpcSpy } = installMocks({ order: null });
    const { raw, signature } = sign(makePayload());

    const res = await post(raw, signature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('orphan');
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('non-captured event (payment.failed) → 200 ignored, no-op', async () => {
    const { rpcSpy } = installMocks();
    const { raw, signature } = sign(makePayload({ event: 'payment.failed' }));

    const res = await post(raw, signature);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ignored');
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
