-- 007_rls_policies.sql
-- RLS already enabled in 004; this adds SELECT policies only.
--
-- Session 11 opens the FIRST read access through the deny-all wall raised in
-- 004_rls_enable.sql. RLS is ALREADY ENABLED on every table (004) with zero policies =
-- deny-all for the anon and authenticated roles. This migration does NOT touch RLS
-- enablement — it ONLY layers SELECT policies on top of the existing deny-all.
--
-- Scope of access opened here (and NOTHING more):
--   • menu_categories / menu_items  — readable by everyone (anon + authenticated). The
--     public menu. No write access; the backend service_role bypasses RLS and owns writes.
--   • orders / order_items / order_events — readable ONLY by the authenticated customer who
--     OWNS the order (customer_id = auth.uid()). A foreign or nonexistent order returns
--     ZERO rows — RLS makes "not yours" and "does not exist" indistinguishable by design,
--     which is the privacy property we want (a foreign order is invisible, not "forbidden").
--
-- NO INSERT/UPDATE/DELETE policies on ANY table: the Express backend uses the service_role
-- key, which bypasses RLS entirely, so all writes already work. The frontend reads via these
-- policies and writes ONLY through the API. NO anon access to anything except the two menu
-- tables. order_items / order_events scope through an EXISTS join to an owned order, never a
-- direct customer_id (those tables have none).
--
-- Idempotent: each policy is DROPped IF EXISTS, then created.

-- ── Public menu: readable by anon + authenticated ──────────────────────────────
DROP POLICY IF EXISTS menu_categories_select_all ON menu_categories;
CREATE POLICY menu_categories_select_all ON menu_categories
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS menu_items_select_all ON menu_items;
CREATE POLICY menu_items_select_all ON menu_items
  FOR SELECT TO anon, authenticated
  USING (true);

-- ── Customer-owned orders: readable ONLY by the owning authenticated customer ──
DROP POLICY IF EXISTS orders_select_own ON orders;
CREATE POLICY orders_select_own ON orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS order_items_select_own ON order_items;
CREATE POLICY order_items_select_own ON order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.customer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS order_events_select_own ON order_events;
CREATE POLICY order_events_select_own ON order_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_events.order_id
        AND o.customer_id = auth.uid()
    )
  );
