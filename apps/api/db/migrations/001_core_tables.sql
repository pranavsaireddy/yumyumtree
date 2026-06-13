-- 001_core_tables.sql
-- Idempotent. Safe to re-run; no existing table or column is altered.
--
-- The first three tables (customers, menu_categories, menu_items) were created
-- before Session 1. They are included here as IF NOT EXISTS guards only —
-- columns are never added, removed, or changed in this file.

CREATE TABLE IF NOT EXISTS customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone          text UNIQUE,
  email          text,
  name           text,
  google_id      text,
  loyalty_points int DEFAULT 0,
  created_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petpooja_id text UNIQUE,
  name        text NOT NULL,
  sort_order  int  DEFAULT 0,
  is_active   bool DEFAULT true
);

CREATE TABLE IF NOT EXISTS menu_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  petpooja_id  text UNIQUE,
  category_id  uuid REFERENCES menu_categories(id),
  name         text NOT NULL,
  description  text,
  price        numeric NOT NULL,
  is_veg       bool DEFAULT false,
  is_available bool DEFAULT true,
  image_url    text,
  sort_order   int  DEFAULT 0
);

-- menu_addons: schema per §6. Table stays dormant — add-ons are CUT C-02.
-- PetPooja cannot sync add-ons; extras are modelled as standalone menu items.
CREATE TABLE IF NOT EXISTS menu_addons (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES menu_items(id) ON DELETE CASCADE,
  name    text    NOT NULL,
  price   numeric NOT NULL
);

-- tables: dine-in seating with unique QR token per seat.
CREATE TABLE IF NOT EXISTS tables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_number int  UNIQUE NOT NULL,
  label        text,
  qr_token     text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text
);

-- orders: core entity.
--   idempotency_key  — client UUID per checkout attempt; ON CONFLICT DO NOTHING enables safe retry.
--   razorpay_payment_id UNIQUE — constraint-level idempotency for at-least-once webhooks.
--   status transitions enforced exclusively via the transition_order RPC (§26).
CREATE TABLE IF NOT EXISTS orders (
  id                  uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key     text    UNIQUE NOT NULL,
  customer_id         uuid    REFERENCES customers(id),
  table_id            uuid    REFERENCES tables(id),
  channel             text    NOT NULL
                              CHECK (channel IN ('web', 'qr', 'whatsapp')),
  order_type          text    NOT NULL
                              CHECK (order_type IN ('delivery', 'dine_in')),
  status              text    NOT NULL DEFAULT 'pending_payment'
                              CHECK (status IN (
                                'pending_payment', 'placed',    'confirmed',
                                'preparing',       'ready',     'dispatched',
                                'delivered',       'served',    'cancelled',
                                'rejected',        'payment_failed', 'expired'
                              )),
  subtotal            numeric NOT NULL,
  discount            numeric DEFAULT 0,
  total               numeric NOT NULL,
  razorpay_order_id   text    UNIQUE,
  razorpay_payment_id text    UNIQUE,
  shadowfax_order_id  text,
  petpooja_order_id   text,
  delivery_address    jsonb,
  scheduled_at        timestamptz,
  placed_at           timestamptz,
  created_at          timestamptz DEFAULT now()
);

-- order_items: name and price are snapshots taken at order time.
-- Never join live menu_items prices into historical orders.
CREATE TABLE IF NOT EXISTS order_items (
  id       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid    REFERENCES orders(id) ON DELETE CASCADE,
  item_id  uuid    REFERENCES menu_items(id),
  name     text    NOT NULL,
  price    numeric NOT NULL,
  quantity int     NOT NULL,
  addons   jsonb   DEFAULT '[]'
);
