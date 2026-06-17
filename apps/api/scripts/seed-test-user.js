'use strict';

// seed-test-user.js — standalone, DEV-ONLY CLI (S11A). Creates/refreshes the deterministic E2E
// user the Playwright suite signs in as, plus its matching customers row so orders FK + RLS work.
//
// IDEMPOTENT: create-or-update on the auth user (by email) and upsert on the customers row (by id).
// The user id == customers.id == the auth.uid() the RLS policies key on (orders.customer_id).
//
// SAFETY: assertSafeTestDb() runs FIRST. Service-role client only (admin auth + customers upsert).
// The email is test_-prefixed (test_e2e@yumyumtree.local) so cleanup can find everything by it.
//
// Prints the user id on success (the global-setup step surfaces it for debugging).

const supabase = require('../src/lib/supabase');
const { assertSafeTestDb } = require('../src/__tests__/setup');

const TEST_EMAIL = 'test_e2e@yumyumtree.local';
// Sane dev default; override with E2E_TEST_PASSWORD. The Playwright auth helper reads the SAME var
// and the SAME default, so the seeded credential and the sign-in credential always agree.
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD || 'e2e-Test-Password-1!';

function fail(message) {
  process.stderr.write(`seed-test-user: ${message}\n`);
  process.exit(1);
}

async function findUserByEmail(email) {
  // admin.listUsers is paginated; the dev project is tiny, but page through to be correct.
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  assertSafeTestDb();

  let user = await findUserByEmail(TEST_EMAIL);

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser failed: ${error.message}`);
    user = data.user;
  } else {
    // Refresh the password so a known-good credential is guaranteed on every run.
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
  }

  // Matching customers row (id = auth uid) so orders.customer_id FK + the owner-scoped RLS policies
  // resolve. Upsert by id → idempotent.
  const { error: custError } = await supabase
    .from('customers')
    .upsert({ id: user.id, email: TEST_EMAIL, name: 'E2E Test User' }, { onConflict: 'id' });
  if (custError) throw new Error(`customers upsert failed: ${custError.message}`);

  process.stdout.write(`${user.id}\n`);
  process.exit(0);
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
