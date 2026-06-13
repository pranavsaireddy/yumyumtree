'use strict';

// describe/it/expect are globals (vitest.config.js → test.globals). Pure unit suite.
const { computeTotals } = require('../../services/pricing');

const ITEM_A = '550e8400-e29b-41d4-a716-446655440000';
const ITEM_B = '550e8400-e29b-41d4-a716-446655440001';

describe('computeTotals', () => {
  it('computes the subtotal across multiple items', () => {
    const items = [
      { item_id: ITEM_A, quantity: 2 },
      { item_id: ITEM_B, quantity: 1 },
    ];
    const priceMap = {
      [ITEM_A]: { name: 'Mutton Biryani', price: 280, is_available: true },
      [ITEM_B]: { name: 'Raita', price: 40, is_available: true },
    };

    const { subtotal, lineItems } = computeTotals(items, priceMap);

    expect(subtotal).toBe(600); // 280*2 + 40*1
    expect(lineItems).toHaveLength(2);
    expect(lineItems[0]).toEqual({
      item_id: ITEM_A,
      name: 'Mutton Biryani',
      price: 280,
      quantity: 2,
      line_total: 560,
    });
  });

  it('throws ITEM_NOT_FOUND (422) when an item is missing from the priceMap', () => {
    const items = [{ item_id: ITEM_A, quantity: 1 }];
    try {
      computeTotals(items, {});
      throw new Error('expected computeTotals to throw');
    } catch (err) {
      expect(err.status).toBe(422);
      expect(err.code).toBe('ITEM_NOT_FOUND');
    }
  });

  it('throws ITEM_UNAVAILABLE (422) when an item is flagged unavailable', () => {
    const items = [{ item_id: ITEM_A, quantity: 1 }];
    const priceMap = { [ITEM_A]: { name: 'Sold Out Dish', price: 100, is_available: false } };
    try {
      computeTotals(items, priceMap);
      throw new Error('expected computeTotals to throw');
    } catch (err) {
      expect(err.status).toBe(422);
      expect(err.code).toBe('ITEM_UNAVAILABLE');
    }
  });

  it('snapshots the price from the priceMap, ignoring any client-supplied price', () => {
    // A malicious/stale client price on the item must NOT influence the total.
    const items = [{ item_id: ITEM_A, quantity: 1, price: 1 }];
    const priceMap = { [ITEM_A]: { name: 'Biryani', price: 280, is_available: true } };

    const { subtotal, lineItems } = computeTotals(items, priceMap);

    expect(lineItems[0].price).toBe(280);
    expect(subtotal).toBe(280);
  });

  it('multiplies price by quantity correctly', () => {
    const items = [{ item_id: ITEM_A, quantity: 4 }];
    const priceMap = { [ITEM_A]: { name: 'Kebab', price: 75, is_available: true } };

    expect(computeTotals(items, priceMap).subtotal).toBe(300);
  });

  it('rounds line totals to 2 decimals (3 × 33.33 = 99.99)', () => {
    const items = [{ item_id: ITEM_A, quantity: 3 }];
    const priceMap = { [ITEM_A]: { name: 'Snack', price: 33.33, is_available: true } };

    const { subtotal, lineItems } = computeTotals(items, priceMap);

    expect(lineItems[0].line_total).toBe(99.99);
    expect(subtotal).toBe(99.99);
  });
});
