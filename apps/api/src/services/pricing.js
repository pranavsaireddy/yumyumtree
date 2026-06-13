'use strict';

// Pure pricing service. computeTotals takes validated order items plus a caller-supplied
// priceMap and returns the subtotal + line items with a PRICE SNAPSHOT. It has NO DB / no
// I/O — in S7 the caller will build priceMap from menu_items rows; that is not this
// session's concern.
//
// INVARIANTS honoured here:
//   - Prices/totals come ONLY from priceMap (DB-sourced), never from client numbers.
//   - Money is rupees (numbers) in the domain; paise conversion happens only at the
//     Razorpay edge, so there is none here.
//   - No discount/loyalty/total logic yet (loyalty is S17) — subtotal only.

// Domain error in the { error, code } contract shape (errorHandler reads err.status/code).
function pricingError(code, message) {
  const err = new Error(message);
  err.status = 422;
  err.code = code;
  return err;
}

// Defensive 2-decimal rounding to keep rupee amounts free of float drift
// (e.g. 33.33 * 3 → 99.99000000000001 → 99.99).
function round2(amount) {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Array<{ item_id: string, quantity: number }>} items   validated order items
 * @param {Record<string, { name: string, price: number, is_available: boolean }>} priceMap
 * @returns {{ subtotal: number, lineItems: Array<object> }}
 */
function computeTotals(items, priceMap) {
  const lineItems = items.map((item) => {
    const entry = priceMap[item.item_id];
    if (!entry) {
      throw pricingError('ITEM_NOT_FOUND', `Item not found: ${item.item_id}`);
    }
    if (!entry.is_available) {
      throw pricingError('ITEM_UNAVAILABLE', `Item unavailable: ${item.item_id}`);
    }

    // Snapshot name + price from priceMap. The client never supplies price; even if it
    // did, it is ignored here by construction.
    const price = round2(entry.price);
    const line_total = round2(price * item.quantity);

    return {
      item_id: item.item_id,
      name: entry.name,
      price,
      quantity: item.quantity,
      line_total,
    };
  });

  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.line_total, 0));

  return { subtotal, lineItems };
}

module.exports = { computeTotals };
