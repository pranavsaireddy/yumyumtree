'use strict';

// describe/it/expect are globals (vitest.config.js → test.globals). Pure unit suite.
const {
  OrderItemSchema,
  CreateOrderSchema,
} = require('../../schemas/order');

// Valid uuids (v4 form) reused across cases.
const ITEM_ID = '550e8400-e29b-41d4-a716-446655440000';
const TABLE_ID = '550e8400-e29b-41d4-a716-446655440001';
const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440002';

const validDelivery = {
  idempotency_key: IDEMPOTENCY_KEY,
  items: [{ item_id: ITEM_ID, quantity: 2 }],
  order_type: 'delivery',
  delivery_address: {
    line1: '12-3-45 Mandi Road',
    city: 'Hyderabad',
    pincode: '500001',
    lat: 17.4,
    lng: 78.4,
  },
};

const validDineIn = {
  idempotency_key: IDEMPOTENCY_KEY,
  items: [{ item_id: ITEM_ID, quantity: 1 }],
  order_type: 'dine_in',
  table_id: TABLE_ID,
};

describe('CreateOrderSchema', () => {
  it('accepts a valid delivery payload', () => {
    const result = CreateOrderSchema.safeParse(validDelivery);
    expect(result.success).toBe(true);
  });

  it('accepts a valid dine_in payload and defaults loyalty_points_to_redeem to 0', () => {
    const result = CreateOrderSchema.safeParse(validDineIn);
    expect(result.success).toBe(true);
    expect(result.data.loyalty_points_to_redeem).toBe(0);
  });

  it('rejects a delivery order without delivery_address', () => {
    const { delivery_address, ...noAddress } = validDelivery;
    expect(CreateOrderSchema.safeParse(noAddress).success).toBe(false);
  });

  it('rejects a dine_in order without table_id', () => {
    const { table_id, ...noTable } = validDineIn;
    expect(CreateOrderSchema.safeParse(noTable).success).toBe(false);
  });

  it('rejects an item carrying an addons key (C-02 cut, strict)', () => {
    const withAddons = {
      ...validDelivery,
      items: [{ item_id: ITEM_ID, quantity: 1, addons: [] }],
    };
    expect(CreateOrderSchema.safeParse(withAddons).success).toBe(false);
  });

  it('rejects quantity 0', () => {
    const bad = { ...validDineIn, items: [{ item_id: ITEM_ID, quantity: 0 }] };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects quantity 51 (over max 50)', () => {
    const bad = { ...validDineIn, items: [{ item_id: ITEM_ID, quantity: 51 }] };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a malformed pincode', () => {
    const bad = {
      ...validDelivery,
      delivery_address: { ...validDelivery.delivery_address, pincode: '50001' },
    };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a past / non-same-day scheduled_at', () => {
    const bad = { ...validDineIn, scheduled_at: '2020-01-01T00:00:00.000Z' };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects lat outside the Hyderabad bounding box', () => {
    const bad = {
      ...validDelivery,
      delivery_address: { ...validDelivery.delivery_address, lat: 19 },
    };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects lng outside the Hyderabad bounding box', () => {
    const bad = {
      ...validDelivery,
      delivery_address: { ...validDelivery.delivery_address, lng: 80 },
    };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown top-level key (strict)', () => {
    const bad = { ...validDineIn, surprise: 'extra' };
    expect(CreateOrderSchema.safeParse(bad).success).toBe(false);
  });
});

describe('OrderItemSchema', () => {
  it('accepts a minimal valid item', () => {
    expect(OrderItemSchema.safeParse({ item_id: ITEM_ID, quantity: 3 }).success).toBe(true);
  });

  it('rejects an addons key directly (C-02 cut, strict)', () => {
    const result = OrderItemSchema.safeParse({ item_id: ITEM_ID, quantity: 1, addons: [] });
    expect(result.success).toBe(false);
  });
});
