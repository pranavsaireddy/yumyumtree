-- 003_indexes.sql
-- Idempotent via IF NOT EXISTS. Requires 001 and 002 to have been applied first.

-- orders: unique constraint on idempotency_key (belt-and-suspenders alongside the column UNIQUE).
CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_key_idx
  ON orders (idempotency_key);

-- orders: partial unique index on razorpay_payment_id.
-- NULL rows are excluded so unconfirmed orders do not conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS orders_razorpay_payment_id_idx
  ON orders (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;

-- orders: active-orders partial index — keeps dashboard queries fast by skipping terminal rows.
CREATE INDEX IF NOT EXISTS orders_status_placed_at_idx
  ON orders (status, placed_at DESC)
  WHERE status NOT IN ('delivered', 'served', 'cancelled', 'rejected', 'expired');

-- orders: customer history lookup.
CREATE INDEX IF NOT EXISTS orders_customer_id_idx
  ON orders (customer_id, placed_at DESC);

-- order_events: lookup all events for an order in chronological order.
CREATE INDEX IF NOT EXISTS order_events_order_id_idx
  ON order_events (order_id, created_at);

-- outbox: partial index covers only the unprocessed rows the drain worker reads.
CREATE INDEX IF NOT EXISTS outbox_unprocessed_idx
  ON outbox (created_at)
  WHERE processed_at IS NULL;
