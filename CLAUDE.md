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
- Phase C (payments) — MONEY LOOP CLOSED. S1–S9 MERGED. Customer can browse → cart → checkout →
  pay → order confirms (pending_payment→placed). Next: OUTBOX DRAIN + side-effect workers arc
  (pg-boss → PetPooja KOT / notifications / Shadowfax) — a placed order is INERT until then.
  Confirm exact next session # against roadmap at Prep.
- Live + verified end-to-end: menu (DB) + cart (persisted) + Google auth + order creation +
  delivery checkout + PAYMENT WEBHOOK (real HMAC, timing-safe, confirm_order). 89 api tests,
  both CI jobs green. Frontend still shows "payment coming soon" (no Razorpay modal yet).
- ⚠️ TWO BEFORE-LAUNCH debts: T-014 (reconcile cron — lost webhook = stuck order) + T-015
  (outbox drain — placed orders inert until pg-boss workers exist). Both block go-live, not building.
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- main clean + pushed (7022a94). Prod env: not yet (S14A). RLS still deny-all (read policies S11).
- Blockers: PetPooja creds+callback (chase 2026-06-18, now critical-path for KOT), Shadowfax/Meta
  (not started), domain not owned (S16). Razorpay test keys: HELD (local .env).
- Gate 0 COMPLETE. Debt T-006..T-015 (T-009 resolved). Risk R-005. D-007 no guest.
- Supabase session in COOKIES not localStorage. On money path verify the DB ROW, not just UI.
  `git status` clean-tree check before each session. CI on Node 22 is the source of truth.

---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S9 (MERGED 2026-06-15): Razorpay payment webhook (POST /payments/webhook). FIRST webhook +
  2nd money-path. express.raw before express.json, HMAC-SHA256 timing-safe verify; payment.captured
  → confirm_order (mig 005, first caller) pending_payment→placed + events/outbox; 3-layer
  idempotency; amount check. 89 tests (real in-test HMAC). Verified live: confirm/replay/bad-sig/
  mismatch. Debt T-014 (reconcile) + T-015 (outbox drain) — both BEFORE LAUNCH.
- S8 (MERGED 2026-06-15): menu API DB-read (exposes uuid id; resolves T-009) + delivery checkout.
  /checkout client page, login gate, Place Order → POST /api/orders. Cart PERSISTED (survives
  OAuth redirect). Stops at order creation. Debt T-012 (geocoding), T-013 (ssr middleware).
- S7 (MERGED 2026-06-14): FIRST money-path — POST /api/orders. Server-side pricing, idempotency
  by DB constraint (place_order RPC, mig 006), Razorpay stub. seedMenu loaded 9 cats/88 items. T-011.


## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11