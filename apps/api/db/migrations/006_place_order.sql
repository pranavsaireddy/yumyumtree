-- 006_place_order.sql
-- CREATE OR REPLACE makes this idempotent. Requires 001_core_tables.sql.
--
-- place_order — the atomic order-creation RPC (architecture §26). Inserts the order
-- (status='pending_payment') and all its order_items in ONE transaction, then returns the
-- order row. This is the multi-table-write boundary required by the INVARIANTS: the route
-- never writes orders + order_items as two separate client calls.
--
-- IDEMPOTENCY is by DB constraint, not app logic. orders.idempotency_key is UNIQUE; the
-- INSERT uses ON CONFLICT (idempotency_key) DO NOTHING. On conflict (a retry, or a race the
-- route's pre-check did not catch) the existing order is returned UNCHANGED and NO new
-- order_items are written — a safe replay, never a duplicate.
--
-- MONEY: subtotal/discount/total are rupees (numeric). order_items.name + price are the
-- caller's computed PRICE SNAPSHOT (§6) — they are NOT re-fetched from menu_items here, so
-- historical orders keep the price charged at order time.
--
-- This function does NOT advance status, write order_events, or write outbox: those belong
-- to the payment-confirmation path (confirm_order, S9). place_order only creates the
-- pending_payment order + its line items.

CREATE OR REPLACE FUNCTION place_order(
  p_idempotency_key   text,
  p_customer_id       uuid,
  p_channel           text,
  p_order_type        text,
  p_table_id          uuid,
  p_delivery_address  jsonb,
  p_scheduled_at      timestamptz,
  p_subtotal          numeric,
  p_discount          numeric,
  p_total             numeric,
  p_razorpay_order_id text,
  p_items             jsonb            -- array of { item_id, name, price, quantity }
) RETURNS orders
LANGUAGE plpgsql
AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_item  jsonb;
BEGIN
  -- Constraint-level idempotency: a duplicate idempotency_key inserts nothing.
  INSERT INTO orders (
    idempotency_key, customer_id, channel, order_type, table_id,
    delivery_address, scheduled_at, status, subtotal, discount, total, razorpay_order_id
  )
  VALUES (
    p_idempotency_key, p_customer_id, p_channel, p_order_type, p_table_id,
    p_delivery_address, p_scheduled_at, 'pending_payment', p_subtotal, p_discount,
    p_total, p_razorpay_order_id
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_order;

  -- Conflict: the order already exists. Return it unchanged, write no items.
  IF v_order.id IS NULL THEN
    SELECT * INTO v_order FROM orders WHERE idempotency_key = p_idempotency_key;
    RETURN v_order;
  END IF;

  -- New order: write the snapshotted line items in the same transaction.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, item_id, name, price, quantity)
    VALUES (
      v_order.id,
      (v_item->>'item_id')::uuid,
      v_item->>'name',
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::int
    );
  END LOOP;

  RETURN v_order;
END;
$$;
