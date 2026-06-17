# CLAUDE.md — YumYumTree Working Set
> Auto-read by Claude Code on every invocation. This file is a CACHE of
> MASTER_EXECUTION_CONTEXT.md — when they disagree, MASTER wins.
> Sources of truth: docs/YumYumTree_Full_Context.md (architecture v3),
> docs/YumYumTree_Implementation_Roadmap.md + docs/YumYumTree_Roadmap_V2_Patch.md
> (the patch IS IN FORCE — lettered sessions S2A/S11A/S14A/S14B/S15A/S24A exist;
> session prompts = v1 prompt + patch diff line).

---

## NORTH STAR
YumYumTree is a direct ordering platform (web, QR dine-in, WhatsApp) for one mandi
restaurant in Hyderabad, replacing Swiggy/Zomato commissions with a system the owner
runs himself. The owner is the paying client; 300–400 orders/day is the design target.
Done = the restaurant takes real paid orders end-to-end (menu→pay→KOT→delivery/serve)
with the owner operating it from the admin dashboard without developer help.

---

## INVARIANTS (violation = the session fails review)
- orders.status changes ONLY via transition_order RPC. Never a raw UPDATE.
- Prices/totals computed ONLY from DB rows. Client numbers are display hints.
- Every webhook route: express.raw mount BEFORE express.json, HMAC timing-safe verify,
  processed_webhooks dedupe, fast 200.
- Multi-table writes go through a Postgres RPC. No client-side "transactions".
- No console.log (pino only). No secrets/env values in code, logs, or tests.
- No new dependency without a literal "DEPENDENCY APPROVED:" line in the session prompt.
- addons are CUT (Cuts Register #2): the word appearing in new order-path code is a bug.
- Dev-only routes mount solely under APP_ENV==='development'.
- Tests must be able to fail; .skip/.only never merge.
- RLS is deny-all from Session 1; only Session 11 adds read policies.
- Build ONLY the current session's scope. Out-of-scope needs go under a PARKED heading.
- Claude Code never runs git (no branch/commit/merge); the human owns all git. The
  session branch is created BEFORE the conversation opens.

## CONVENTIONS
- Errors: { error, code } + correct HTTP status, thrown via asyncHandler.
- IDs are uuids; money in rupees (numeric) in DB, paise (int) only at the Razorpay edge.
- File layout per architecture §5; tests mirror src; fixtures under src/mocks.
- apps/api is CommonJS; apps/web is TypeScript strict.
- Migrations: numbered SQL files in apps/api/db/migrations/, idempotent, applied via
  SQL editor until S14A introduces the runner. Use the next free integer per session
  (v1 roadmap numbers are nominal, not literal).
- External partners live behind *_MODE env flags: mock until their real-integration session.

---

## LOCAL ENV / CONNECTIVITY (load-bearing — bites at boot)
- pg-boss connects to the Supabase DIRECT db host (db.<ref>.supabase.co:5432), whose DNS is
  IPv6-ONLY (AAAA record). The dev's home ethernet (Airtel Xtream) has NO IPv6 → the host fails
  to resolve → the api hard-exits on boot (server.js process.exit(1) when startWorkers fails:
  "Connection terminated due to connection timeout").
- WORKAROUND (mandatory): for ANY session that boots the api / runs pg-boss / runs the E2E suite,
  the developer must be on MOBILE HOTSPOT (which has IPv6), NOT the Airtel ethernet. Sessions that
  only hit Supabase REST/PostgREST over HTTPS (e.g. menu, raw RLS probes) work on either network —
  only the DIRECT 5432 / pg-boss path needs IPv6.
- Do NOT "fix" this with a local/Docker Postgres standing in for pg-boss in tests — that makes the
  suite pass against a FAKE DB and defeats the point. Tests run against the real Supabase DB; the
  fix is the network (hotspot), not a substitute DB.
- DATABASE_URL must be the direct 5432 string, never the :6543 pooler (config.js refuses :6543).
- CI: GitHub runners ARE IPv6-capable, so the direct connection is expected to resolve there
  (first proven at S11A — watch for it).

---

## CURRENT STATE (rewritten every session)
- Phase D/E (fulfilment, mocked). S1–S11 MERGED + main green (cea27c8). Customer can browse →
  cart → checkout → pay → confirm → FAN-OUT to queues (stubs) → and WATCH IT LIVE on
  /track/[orderId] (RLS-scoped read + Realtime + 15s poll fallback). Next: S11A (Playwright
  critical-path E2E — V2 patch inserts it after S11). Confirm against roadmap at Prep.
- 96 api tests; web build green. Verified live S11: anon→0 orders, own-token→own 3 orders, SQL
  transition→stepper advances live (pill "Live"), offline→poll→restore, logged-out→sign-in.
- AUTH (settled S11): real session = Supabase cookie sb-<ref>-auth-token (S6 Google OAuth via
  @supabase/ssr); browser client reads it → auth.uid() works for RLS. The custom localStorage.
  token (id/iat/exp) is INERT leftover — T-017, delete it (tripped auth investigations twice).
- PATTERN LOCKED (D-008): customer order reads go via RLS (Supabase browser client), NOT a
  backend GET route (no GET /api/orders/:id exists). Reads via RLS, writes via API.
- ⚠️ BEFORE-LAUNCH debts: T-014 (reconcile cron), T-015 (drain wired, workers STUBS — no real
  kitchen until S12/S13), T-016 (S12/S13 must make PetPooja/Shadowfax idempotent). NEW T-017
  (dead localStorage cleanup). Block go-live, not building.
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- Prod env: none yet (S14A). RLS read policies live (007). Realtime on orders enabled. pgboss
  schema in DEV. Frontend still shows "payment coming soon" (no Razorpay modal).
- Blockers: PetPooja CREDENTIALS only (callback CONFIRMED + docs v2.1.0 in hand, C-03 resolved;
  staging keys needed for S12), Shadowfax/Meta (not started), domain (S16). Razorpay test: HELD.
- Gate 0 COMPLETE. Debt T-006..T-017 (T-004, T-009 resolved). Risk R-005. D-007/D-008.
- PROCESS: branch-CI-green is the MERGE GATE (push branch → watch branch CI → squash to main).
  PowerShell git one line at a time; probes via Invoke-RestMethod / -UseBasicParsing (legacy IE
  parser can show false []). Supabase session in COOKIES. On money path verify the DB ROW. CI = truth.
---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S11 (MERGED 2026-06-16): Order tracking — RLS read policies + Realtime UI + poll fallback.
  Migration 007_rls_policies.sql (POLICIES ONLY; RLS enabled in 004): menu public; orders/
  order_items/order_events owner-scoped (customer_id=auth.uid() / EXISTS join). No write policies.
  /track/[orderId] reads via RLS browser client (D-008: NO GET route), Realtime + 15s poll,
  StatusStepper (delivery/dine_in) + terminals. Verified: anon→0, own→own 3 orders, live advance,
  offline→poll→restore, logged-out→sign-in. Auth scare resolved (Supabase cookie real; localStorage
  .token inert → T-017). T-004 resolved.
- S10 (MERGED 2026-06-16): pg-boss queue + outbox drain + STUB workers. order.placed fans to
  pushKot+notify always, +dispatch when delivery. At-least-once, restart-idempotent. config
  refuses :6543. order-not-found permanent (.maybeSingle). HOTFIX: /readyz short-circuits before
  DB + 2s abort (CI hung on placeholder DB). 96 tests. T-015 updated, T-016 added.
- S9 (MERGED 2026-06-15): Razorpay payment webhook. express.raw before json, HMAC timing-safe;
  payment.captured → confirm_order (mig 005) placed + events/outbox; 3-layer idempotency; amount
  check. 89 tests. Verified live. Debt T-014 + T-015.

## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11