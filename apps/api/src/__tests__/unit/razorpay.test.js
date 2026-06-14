'use strict';

// describe/it/expect are globals (vitest.config.js → test.globals). Pure unit suite — no DB,
// no real Razorpay (the service is in mock mode under the test env).
const razorpay = require('../../services/razorpay');

describe('razorpay.createOrder (mock mode)', () => {
  it('defaults to mock mode under the test env', () => {
    expect(razorpay.MODE).toBe('mock');
  });

  it('returns a Razorpay-shaped order, echoing the paise amount and receipt', async () => {
    const order = await razorpay.createOrder({ amount: 99800, receipt: 'idem-key-1' });

    expect(order).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^order_mock_/),
        amount: 99800, // amount is PAISE at this edge — passed straight through
        currency: 'INR',
        status: 'created',
        receipt: 'idem-key-1',
      })
    );
  });

  it('produces a distinct id per call (no accidental collisions)', async () => {
    const a = await razorpay.createOrder({ amount: 100, receipt: 'r1' });
    const b = await razorpay.createOrder({ amount: 100, receipt: 'r2' });
    expect(a.id).not.toBe(b.id);
  });
});
