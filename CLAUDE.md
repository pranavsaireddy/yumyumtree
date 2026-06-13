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
- Phase: A (Foundation). S1 + S2 + S2A MERGED. Next: Session 3 (domain core — state-machine
  app-mirror, Zod schemas in packages/types, pricing service; pure logic, no DB writes).
- CI LIVE & GREEN on Node 22 (api job runs Vitest; 1 passed | 1 skipped without DEV secrets).
  Backend platform live (S2). apps/web re-scaffolded on Next 16 (D-005) + committed.
- main clean + pushed. Prod env: not yet (S14A). CI repo secrets NOT added (DB test skips in
  CI by design; local suite covers it).
- External blockers: PetPooja creds + callback (chase 2026-06-18), Shadowfax/Meta (not
  started), Razorpay (test mode on demand), domain not owned (needed before S16).
- Gate 0: COMPLETE. Debt: T-006 (vitest audit, parked), T-007 (CI action-version deprecation).
- CI on Node 22 is the source of truth, not local Node 24.

---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S2A (MERGED 2026-06-13): GitHub Actions CI (api job, Node 22, Vitest). CI caught a real
  Node-20-no-WebSocket bug → fixed by Node 20→22. apps/web re-scaffolded (Next 16). web CI
  job parked until S5.
- S2 (MERGED 2026-06-13): backend platform — fail-fast config, pino, error contract,
  /health + /readyz, Vitest+Supertest harness with assertSafeTestDb prod-fence.
- S1 (MERGED 2026-06-13): 13 tables, indexes, RLS deny-all, confirm_order + transition_order
  RPCs. State machine + idempotency verified live. Migrations run by hand (runner = S14A).


## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11