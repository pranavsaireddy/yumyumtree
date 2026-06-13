-- 004_rls_enable.sql
-- Enables Row Level Security on every table with ZERO policies.
-- Zero policies = deny-all for the anon and authenticated roles.
-- The service_role bypasses RLS entirely, so the Express backend is unaffected.
--
-- Idempotent: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is a no-op if already enabled.
-- Read policies are added in a later session (S11). Do NOT add any policies here.

-- Pre-existing tables
ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories      ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items           ENABLE ROW LEVEL SECURITY;

-- Tables added in 001_core_tables.sql
ALTER TABLE menu_addons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables               ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;

-- Tables added in 002_reliability_tables.sql
ALTER TABLE order_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhooks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox               ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_sync_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sessions    ENABLE ROW LEVEL SECURITY;
