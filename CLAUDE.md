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

## CURRENT STATE (rewritten every session)
- Phase B + auth COMPLETE: S1–S7 MERGED. Phase C (payments) begins. Next: Session 8 — checkout
  UI + flow (cart → POST /api/orders → Razorpay checkout; login-required gate per D-007; add
  @supabase/ssr middleware for server-side auth).
- Live: menu API + page + cart + Google auth + ORDER CREATION (POST /api/orders, money-path
  verified end-to-end against real DB). 80 api tests green, both CI jobs green.
- DB SEEDED: menu_categories (9) + menu_items (88) via scripts/seedMenu.js. Migration 006
  (place_order RPC) applied to DEV. Order be0ee15c verified live (customer_id=auth uid).
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- main clean + pushed. Prod env: not yet (S14A). RLS still deny-all (read policies S11).
- Blockers: PetPooja creds+callback (chase 2026-06-18), Shadowfax/Meta (not started), Razorpay
  TEST-MODE keys (stub works now; needed for real-Razorpay session), domain not owned (S16).
- Gate 0 COMPLETE. Debt T-006..T-011 (T-011 idempotency race). Risk R-005. D-007 no guest.
- Supabase session is in COOKIES not localStorage. `git status` clean-tree check before each
  session. CI on Node 22 is the source of truth.

---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S7 (MERGED 2026-06-14): FIRST money-path — POST /api/orders (pending_payment). Auth-required,
  server-side pricing from menu_items, idempotency by DB constraint (place_order RPC, mig 006),
  atomic order+items, Razorpay stub (mock/501). seedMenu.js loaded 9 cats/88 items to DB.
  80 tests. Verified live: real order, tamper-422, idempotent-replay, no-token-401. T-011 debt.
- S6 (MERGED 2026-06-14): Google sign-in (Supabase OAuth). AuthButton island; /auth/callback;
  POST /api/auth/sync verifies token, upserts customers (id==auth uid). D-007 = no guest.
  Supabase session lives in cookies, not localStorage.
- S5 (MERGED 2026-06-14): FIRST frontend — server-component menu page + in-memory cart
  (drawer/bar/sheet). Navy/gold brand. web CI job un-parked.


## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11