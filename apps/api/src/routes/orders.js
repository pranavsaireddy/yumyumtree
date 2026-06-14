'use strict';

const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const supabase = require('../lib/supabase');
const { CreateOrderSchema } = require('../schemas/order');
const { computeTotals } = require('../services/pricing');
const razorpay = require('../services/razorpay');

const router = express.Router();

// POST /api/orders — create an order in status 'pending_payment'. FIRST MONEY-PATH route.
//
// The three money-path guarantees, all enforced here and never trusted to the client:
//   1. IDENTITY  — customer_id is the verified token's uid (getUser), never from the body.
//                  The body schema is .strict(), so a smuggled `customer_id` key is a 422,
//                  not a silent override.
//   2. PRICING   — totals come ONLY from menu_items rows fetched by id from the DB and run
//                  through computeTotals. Any price in the request body is ignored entirely.
//   3. IDEMPOTENCY — by DB constraint (orders.idempotency_key UNIQUE) inside place_order,
//                  not app logic. A replayed key returns the same order and creates no
//                  second Razorpay order (the pre-check below short-circuits before the edge).
//
// Atomic order + order_items write goes through the place_order RPC (§26). Razorpay amount
// is paise ONLY at that service edge; everything persisted here is rupees.

function unauthenticated(res) {
  return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
}

// Only the fields the frontend needs to open Razorpay checkout — nothing internal.
function checkoutResponse(order) {
  return {
    order_id: order.id,
    razorpay_order_id: order.razorpay_order_id,
    amount: Math.round(Number(order.total) * 100), // paise — the Razorpay edge unit
    currency: 'INR',
  };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    // ── 1. AUTH: identity comes only from the verified token ─────────────────
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    if (!token) return unauthenticated(res);

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    const user = authData && authData.user;
    if (authError || !user) return unauthenticated(res);
    const customerId = user.id;

    // ── 2. VALIDATE the body (strict — unknown keys rejected) ────────────────
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(422).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    const body = parsed.data;

    // Loyalty redemption is S17 — accept the field (default 0) but reject any actual redeem.
    if (body.loyalty_points_to_redeem > 0) {
      return res.status(422).json({
        error: 'Loyalty redemption is not available yet',
        code: 'LOYALTY_NOT_SUPPORTED',
      });
    }

    // ── 3. IDEMPOTENCY pre-check: a known key returns the existing order, and
    //        crucially never reaches the Razorpay edge a second time. ─────────
    const { data: existing, error: existingError } = await supabase
      .from('orders')
      .select('*')
      .eq('idempotency_key', body.idempotency_key)
      .maybeSingle();
    if (existingError) {
      const err = new Error('Failed to look up order');
      err.status = 500;
      err.code = 'ORDER_LOOKUP_FAILED';
      throw err;
    }
    if (existing) {
      return res.status(200).json(checkoutResponse(existing));
    }

    // ── 4. SERVER-SIDE PRICING from DB rows only ─────────────────────────────
    const itemIds = body.items.map((i) => i.item_id);
    const { data: rows, error: itemsError } = await supabase
      .from('menu_items')
      .select('id, name, price, is_available')
      .in('id', itemIds);
    if (itemsError) {
      const err = new Error('Failed to fetch menu items');
      err.status = 500;
      err.code = 'MENU_FETCH_FAILED';
      throw err;
    }

    const priceMap = {};
    for (const row of rows || []) {
      priceMap[row.id] = {
        name: row.name,
        price: Number(row.price),
        is_available: row.is_available,
      };
    }

    // Throws ITEM_NOT_FOUND / ITEM_UNAVAILABLE (422) — handled by the error middleware.
    const { subtotal, lineItems } = computeTotals(body.items, priceMap);

    // Loyalty deferred: no discount this session. total === subtotal.
    const discount = 0;
    const total = subtotal;

    // ── 5. Razorpay edge — paise only here, and only on a genuinely new order ─
    const amountPaise = Math.round(total * 100);
    const rzpOrder = await razorpay.createOrder({
      amount: amountPaise,
      receipt: body.idempotency_key,
    });

    // ── 6. ATOMIC write: order + order_items via place_order RPC ──────────────
    const { data: order, error: rpcError } = await supabase.rpc('place_order', {
      p_idempotency_key: body.idempotency_key,
      p_customer_id: customerId, // token uid — NEVER from the body
      p_channel: 'web', // server-set; not trusted from the client
      p_order_type: body.order_type,
      p_table_id: body.table_id || null,
      p_delivery_address: body.delivery_address || null,
      p_scheduled_at: body.scheduled_at || null,
      p_subtotal: subtotal,
      p_discount: discount,
      p_total: total,
      p_razorpay_order_id: rzpOrder.id,
      p_items: lineItems, // snapshot name + price, NOT re-fetched downstream
    });
    if (rpcError || !order) {
      const err = new Error('Failed to create order');
      err.status = 500;
      err.code = 'ORDER_CREATE_FAILED';
      throw err;
    }

    return res.status(201).json(checkoutResponse(order));
  })
);

module.exports = router;
