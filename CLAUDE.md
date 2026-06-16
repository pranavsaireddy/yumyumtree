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
- Phase D/E (fulfilment, mocked). S1–S10 MERGED + main green. Money loop closed (S9) AND placed
  order now FANS OUT: outbox drain → pg-boss queues → 4 STUB workers (trace events only; no real
  KOT/dispatch until S12/S13). Next: S11 (Order Tracking: RLS read policies + Realtime UI + polling).
- ⚠️ S11 CHANGES CHARACTER: first session to OPEN RLS (read policies for customer-owned rows) —
  touches SECURITY POSTURE; brings the FRONTEND back. deny-all wall opens a deliberate crack.
  Review RLS line-by-line; run the anon-key zero-rows probe.
- Live + verified end-to-end: menu (DB) + cart (persisted) + Google auth + order creation +
  delivery checkout + payment webhook + OUTBOX FAN-OUT (order 57cc372e, restart-idempotent).
  96 api tests, both CI jobs green. Frontend still shows "payment coming soon" (no Razorpay modal).
- ⚠️ BEFORE-LAUNCH debts: T-014 (reconcile cron — lost webhook = stuck order), T-015 (drain wired
  but workers STUBS — no real kitchen until S12/S13). T-016 (S12/S13 must make PetPooja/Shadowfax
  calls IDEMPOTENT — drain is at-least-once). T-014/T-015 block go-live, not building.
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- main clean + pushed (adde37a). Prod env: not yet (S14A). RLS deny-all until S11. pgboss schema in DEV.
- Blockers: PetPooja CREDENTIALS only (callback CONFIRMED + docs v2.1.0 in hand, C-03 resolved;
  staging keys needed for S12 live test, gated by fee approval), Shadowfax/Meta (not started),
  domain not owned (S16). Razorpay test keys: HELD (local .env).
- Gate 0 COMPLETE. Debt T-006..T-016 (T-009 resolved). Risk R-005. D-007 no guest.
- PROCESS (reinforced S10): branch-CI-green is the MERGE GATE — push branch, watch branch CI
  green, THEN squash to main (matters most on CI/boot/lifecycle changes; local≠CI bit again).
  Supabase session in COOKIES. On money path verify the DB ROW not just UI. CI is the source of truth.

---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S10 (MERGED 2026-06-16): pg-boss queue + outbox drain + STUB workers. confirm_order's outbox
  rows now MOVE: 2s overlap-guarded drain → order.placed fans to pushKot+notify always,
  +dispatch when delivery (delivery=3/dine_in=2). At-least-once (processed_at only after sends);
  idempotent across restarts. config requires DATABASE_URL, refuses :6543. /readyz reports
  boss_started+outbox_unprocessed. pg-boss v12: retry on createQueue, batch handlers. HARDENING:
  order-not-found is permanent → mark processed + warn (.maybeSingle), not retried forever.
  HOTFIX: /readyz hung in CI on placeholder DB → boss-down short-circuits before DB + 2s abort.
  96 tests. Verified live (order 57cc372e). T-015 updated (wired, stubs), T-016 added (S12/S13
  idempotency). LESSON: branch-CI-green before merging to main.
- S9 (MERGED 2026-06-15): Razorpay payment webhook (POST /payments/webhook). FIRST webhook +
  2nd money-path. express.raw before express.json, HMAC timing-safe verify; payment.captured →
  confirm_order (mig 005, first caller) pending_payment→placed + events/outbox; 3-layer
  idempotency; amount check. 89 tests. Verified live. Debt T-014 + T-015.
- S8 (MERGED 2026-06-15): menu API DB-read (exposes uuid id; resolves T-009) + delivery checkout.
  /checkout client page, login gate, Place Order → POST /api/orders. Cart PERSISTED (survives
  OAuth redirect). Stops at order creation. Debt T-012 (geocoding), T-013 (ssr middleware).


## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11