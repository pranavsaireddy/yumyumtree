'use strict';

// describe/it/expect/vi/afterEach are globals (vitest.config.js → test.globals).
const crypto = require('crypto');
const request = require('supertest');

const app = require('../../app');
const supabase = require('../../lib/supabase');
const razorpay = require('../../services/razorpay');

// Pure HTTP against POST /api/orders with the Supabase client + Razorpay edge mocked — no
// real DB, no real Auth, no real payment gateway. So no assertSafeTestDb fence is needed.
//
// MONEY-PATH coverage: identity comes only from the token, totals only from mocked DB
// prices, idempotency creates exactly one Razorpay order on replay.

const ITEM_A = '11111111-1111-4111-8111-111111111111';
const TABLE_ID = '33333333-3333-4333-8333-333333333333';

// DB price 499 — the ONLY price that may drive the total. A client cannot supply a price
// (the schema is strict), and even the route never reads one.
const MENU_ROWS = [{ id: ITEM_A, name: 'Chicken Faham Mandi (Half)', price: 499, is_available: true }];

function validBody(overrides = {}) {
  return {
    idempotency_key: crypto.randomUUID(),
    items: [{ item_id: ITEM_A, quantity: 2 }],
    order_type: 'dine_in',
    table_id: TABLE_ID,
    ...overrides,
  };
}

// Wires the three Supabase touchpoints + leaves the real (mock-mode) Razorpay service in
// place so createOrder call-counts are real. `store.order` simulates the UNIQUE-constraint
// persistence: the first place_order "insert" wins, replays read it back.
function installMocks({ user = { id: 'uid-from-token' }, menuRows = MENU_ROWS, store = { order: null } } = {}) {
  vi.spyOn(supabase.auth, 'getUser').mockResolvedValue(
    user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } }
  );

  vi.spyOn(supabase, 'from').mockImplementation((table) => {
    if (table === 'orders') {
      const q = {};
      q.select = vi.fn(() => q);
      q.eq = vi.fn(() => q);
      q.maybeSingle = vi.fn(() => Promise.resolve({ data: store.order, error: null }));
      return q;
    }
    if (table === 'menu_items') {
      const q = {};
      q.select = vi.fn(() => q);
      q.in = vi.fn(() => Promise.resolve({ data: menuRows, error: null }));
      return q;
    }
    throw new Error(`unexpected table in test: ${table}`);
  });

  // place_order: simulate the constraint — first call inserts, conflicts return the stored row.
  vi.spyOn(supabase, 'rpc').mockImplementation((fn, params) => {
    if (!store.order) {
      store.order = {
        id: 'order-uuid-1',
        customer_id: params.p_customer_id,
        subtotal: params.p_subtotal,
        total: params.p_total,
        razorpay_order_id: params.p_razorpay_order_id,
        status: 'pending_payment',
      };
    }
    return Promise.resolve({ data: store.order, error: null });
  });

  const createOrderSpy = vi.spyOn(razorpay, 'createOrder');
  return { createOrderSpy };
}

describe('POST /api/orders', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('401 UNAUTHENTICATED when no Authorization header is sent', async () => {
    const res = await request(app).post('/api/orders').send(validBody());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('401 UNAUTHENTICATED when the token is invalid', async () => {
    installMocks({ user: null });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer bogus')
      .send(validBody());
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
  });

  it('201 and computes the total from the DB price (qty 2 × ₹499 = ₹998 → 99800 paise)', async () => {
    const { createOrderSpy } = installMocks();

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      order_id: 'order-uuid-1',
      razorpay_order_id: expect.stringMatching(/^order_mock_/),
      amount: 99800, // 499 * 2 * 100 — DB price, never a client number
      currency: 'INR',
    });

    // The Razorpay edge received the DB-derived paise amount, not anything client-supplied.
    expect(createOrderSpy).toHaveBeenCalledTimes(1);
    expect(createOrderSpy.mock.calls[0][0].amount).toBe(99800);

    // The order persisted the DB-derived rupee total.
    const rpcParams = supabase.rpc.mock.calls[0][1];
    expect(rpcParams.p_total).toBe(998);
    expect(rpcParams.p_subtotal).toBe(998);
    expect(rpcParams.p_discount).toBe(0);
  });

  it('rejects (422) an item carrying a client-supplied price — it cannot be smuggled in', async () => {
    installMocks();
    const body = validBody({ items: [{ item_id: ITEM_A, quantity: 1, price: 1 }] });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(body);

    // The strict schema rejects the unknown `price` key outright — the client never gets a
    // chance to influence the total.
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('uses the token uid as customer_id, never a body-supplied one', async () => {
    installMocks({ user: { id: 'uid-from-token' } });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody());

    expect(res.status).toBe(201);
    const rpcParams = supabase.rpc.mock.calls[0][1];
    expect(rpcParams.p_customer_id).toBe('uid-from-token');
    expect(rpcParams.p_channel).toBe('web'); // server-set, not from body
  });

  it('rejects (422) a body that tries to smuggle its own customer_id', async () => {
    installMocks();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody({ customer_id: 'attacker-uid' }));

    // Identity can't even be expressed in the body — strict schema → 422.
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('idempotency: same key twice → same order, exactly one Razorpay createOrder call', async () => {
    const { createOrderSpy } = installMocks();
    const body = validBody(); // same idempotency_key reused below

    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(body);
    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(body);

    expect(res1.status).toBe(201); // freshly inserted
    expect(res2.status).toBe(200); // replay — existing order returned unchanged
    expect(res1.body.order_id).toBe(res2.body.order_id);
    expect(res1.body.razorpay_order_id).toBe(res2.body.razorpay_order_id);

    // The replay short-circuited before the Razorpay edge: no second order, no duplicate insert.
    expect(createOrderSpy).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  it('422 LOYALTY_NOT_SUPPORTED when loyalty_points_to_redeem > 0', async () => {
    installMocks();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody({ loyalty_points_to_redeem: 5 }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('LOYALTY_NOT_SUPPORTED');
  });

  it('422 ITEM_NOT_FOUND when an item id is absent from the DB', async () => {
    const { createOrderSpy } = installMocks({ menuRows: [] }); // DB returns no rows
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody());

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ITEM_NOT_FOUND');
    expect(createOrderSpy).not.toHaveBeenCalled(); // never reached the money edge
  });

  it('422 ITEM_UNAVAILABLE when the referenced item is flagged unavailable', async () => {
    const { createOrderSpy } = installMocks({
      menuRows: [{ id: ITEM_A, name: 'Sold Out', price: 499, is_available: false }],
    });
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody());

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ITEM_UNAVAILABLE');
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it('422 when a delivery order omits delivery_address (schema cross-field refine)', async () => {
    installMocks();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', 'Bearer valid')
      .send(validBody({ order_type: 'delivery', table_id: undefined }));

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
