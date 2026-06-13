# apps/api tests

Vitest (node environment). Run from `apps/api/`:

```bash
npm test          # vitest run (CI / one-shot)
npm run test:watch
```

Test files live under `src/__tests__/` and are matched by `src/**/*.test.js`
(see `vitest.config.js`). Tests mirror `src/`; shared fixtures/mocks belong under
`src/mocks` (none yet).

## Database isolation strategy

There is **one** Supabase project for development (DEV). There is no separate test
database — by design (two-environment model, MASTER §10 / D-003). Tests therefore run
against the **DEV project only**, and we protect against ever pointing them at production:

- **`assertSafeTestDb()`** (`src/__tests__/setup.js`) is the guard. Every suite that
  touches the DB calls it in `beforeAll`. It throws if `APP_ENV === 'production'`, or if
  the configured `SUPABASE_URL` host matches `PROD_DB_HOST` (the prod-fence env introduced
  at Session 14A; tolerated as absent until then).
- **`APP_ENV=test`** is forced by `vitest.config.js`, so a stray `APP_ENV=production` in a
  local `.env` cannot leak into a test run.

## Integration data hygiene

Integration tests that **write** rows must:

1. Tag every inserted row with a `test_` prefix on a natural text field (e.g. names,
   idempotency keys: `test_<uuid>`), so test data is always identifiable.
2. Delete those rows in `afterAll`, scoped to the `test_` prefix — never a blanket delete.

The current `health.test.js` is **read-only** (it only hits `/health` and `/readyz`), so it
inserts nothing and needs no cleanup. The prefix-and-clean rule applies to future write
suites (orders, webhooks).

## Prerequisite

`src/config.js` validates the environment at import time and exits if a required var is
missing, so `.env` must contain the five required vars (`PORT`, `FRONTEND_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`) pointing at the **DEV** Supabase
project before the suite can run. `/readyz` performs a real DB round-trip.
