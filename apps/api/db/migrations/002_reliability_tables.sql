-- 002_reliability_tables.sql
-- Idempotent. Requires 001_core_tables.sql to have been applied first.

-- order_events: append-only audit log — every lifecycle event on an order.
CREATE TABLE IF NOT EXISTS order_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid REFERENCES orders(id) ON DELETE CASCADE,
  event      text NOT NULL,
  actor      text DEFAULT 'system',
  payload    jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- processed_webhooks: webhook deduplication.
-- UNIQUE(source, event_id, event_type) makes the INSERT itself idempotent at the DB layer.
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source       text  NOT NULL,
  event_id     text  NOT NULL,
  event_type   text  NOT NULL,
  raw_payload  jsonb NOT NULL,
  processed_at timestamptz DEFAULT now(),
  UNIQUE (source, event_id, event_type)
);

-- outbox: transactional outbox for side effects.
-- Written atomically with the order state change; drained by the outbox worker.
CREATE TABLE IF NOT EXISTS outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate    text NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz DEFAULT now(),
  processed_at timestamptz
);

-- loyalty_transactions: one row per order.
-- UNIQUE on order_id makes point awards idempotent (ON CONFLICT DO NOTHING).
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid REFERENCES customers(id),
  order_id        uuid REFERENCES orders(id) UNIQUE,
  points_earned   int DEFAULT 0,
  points_redeemed int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

-- menu_sync_log: one row per PetPooja menu synchronisation run.
CREATE TABLE IF NOT EXISTS menu_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at     timestamptz DEFAULT now(),
  items_updated int,
  status        text,
  error         text
);

-- whatsapp_sessions: per-phone conversation state for the WhatsApp bot (Phase 3).
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text UNIQUE,
  state       text DEFAULT 'idle',
  order_draft jsonb DEFAULT '{}',
  updated_at  timestamptz DEFAULT now()
);
