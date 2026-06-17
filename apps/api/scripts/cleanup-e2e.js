'use strict';

// cleanup-e2e.js — standalone, DEV-ONLY CLI (S11A). Deletes the rows the E2E run created for the
// test user, leaving the menu (and everything else) untouched. Run by Playwright's global teardown.
//
// Deletes, scoped to the test_e2e user / its simulated payments:
//   - outbox             rows for the test user's orders (no FK cascade, so deleted explicitly)
//   - orders             of the test user  → CASCADES to order_items + order_events (§ migs 001/002)
//   - processed_webhooks rows from the simulator (event_id LIKE 'pay_test_%')
// It does NOT delete the auth user or the customers row — they carry no order data and keeping them
// makes re-runs fast and idempotent. assertSafeTestDb() runs FIRST. Service-role client only.

const supabase = require('../src/lib/supabase');
const { assertSafeTestDb } = require('../src/__tests__/setup');

const TEST_EMAIL = 'test_e2e@yumyumtree.local';

function fail(message) {
  process.stderr.write(`cleanup-e2e: ${message}\n`);
  process.exit(1);
}

async function main() {
  assertSafeTestDb();

  // Resolve the test user's customer id by its test_-prefixed email.
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id')
    .eq('email', TEST_EMAIL)
    .maybeSingle();
  if (custErr) throw new Error(`customers lookup failed: ${custErr.message}`);

  // Always clear simulator webhook records, even when no orders remain.
  const { error: pwErr } = await supabase
    .from('processed_webhooks')
    .delete()
    .like('event_id', 'pay_test_%');
  if (pwErr) throw new Error(`processed_webhooks delete failed: ${pwErr.message}`);

  if (!customer) {
    process.stdout.write('cleanup-e2e: no test customer found — cleared simulator webhooks only\n');
    process.exit(0);
  }

  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('id')
    .eq('customer_id', customer.id);
  if (ordErr) throw new Error(`orders lookup failed: ${ordErr.message}`);

  const orderIds = (orders || []).map((o) => o.id);
  if (orderIds.length === 0) {
    process.stdout.write('cleanup-e2e: no test orders — cleared simulator webhooks only\n');
    process.exit(0);
  }

  // outbox has no FK cascade — delete its rows for these orders first.
  const { error: obErr } = await supabase.from('outbox').delete().in('aggregate_id', orderIds);
  if (obErr) throw new Error(`outbox delete failed: ${obErr.message}`);

  // Deleting the orders cascades to order_items + order_events (ON DELETE CASCADE).
  const { error: oErr } = await supabase.from('orders').delete().in('id', orderIds);
  if (oErr) throw new Error(`orders delete failed: ${oErr.message}`);

  process.stdout.write(
    `cleanup-e2e: deleted ${orderIds.length} order(s) (+items/events via cascade), their outbox rows, and simulator webhooks for ${TEST_EMAIL}\n`
  );
  process.exit(0);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
