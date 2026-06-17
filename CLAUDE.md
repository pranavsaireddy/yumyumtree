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
- pg-boss needs a direct Postgres session (port 5432, session mode — LISTEN/NOTIFY + advisory
  locks). Two ways to reach it, and the WHY behind the rule:
  - Supabase DIRECT host (db.<ref>.supabase.co:5432) is IPv6-ONLY (AAAA only). IPv4-only networks
    can't reach it → connect ENETUNREACH / connection timeout → server.js process.exit(1) on boot
    (startWorkers fails). This bit BOTH the dev's home ethernet (Airtel Xtream, no IPv6) AND the
    GitHub CI runners (IPv4-only) — proven at S11A with `connect ENETUNREACH 2406:da1a:...:5432`.
  - SOLUTION (in force since S11A): use the Supabase SESSION POOLER everywhere —
    aws-0-<region>.pooler.supabase.com:5432, user postgres.<ref>. It is IPv4-reachable AND
    session-mode (pg-boss-compatible), and :5432 passes config.js's guard. DATABASE_URL = the
    session-pooler string in: local apps/api/.env AND the GitHub DATABASE_URL secret.
- RESULT: ethernet works everywhere now — NO mobile hotspot needed (the old hotspot workaround is
  retired; it was only ever a way to get IPv6, which the pooler makes unnecessary).
- NEVER the TRANSACTION pooler (:6543) — transaction mode breaks pg-boss (no session LISTEN/locks),
  and config.js refuses :6543 anyway. Session pooler = :5432; transaction pooler = :6543.
- Pooler has a free-tier connection cap; fine for 1 dev + E2E. "too many connections" = pooler
  limit, not a code bug.
- Do NOT "fix" a connection failure with a local/Docker Postgres standing in for pg-boss — that
  makes tests pass against a FAKE DB. Tests run against the real Supabase DB via the pooler.
- REST/PostgREST-over-HTTPS (menu, raw RLS probes) never needed any of this — works on any network.
- Prod (S14A, Railway) has IPv6, so it MAY use the direct host — but the pooler works there too and
  is the simpler single-string-everywhere choice.

---

## CURRENT STATE (rewritten every session)
- Phase D/E (fulfilment, mocked). S1–S11A MERGED + main green (9316c61). Money path is now GUARDED
  BY AN AUTOMATED E2E in CI on every push (menu→cart→checkout→simulated webhook→/track Placed).
  Next: S12 (real PetPooja KOT — swap the pushKot stub for live /saveorder).
- CI = 3 jobs (api vitest, web lint+build, e2e playwright), all green on main. Local api boots on
  ethernet via the session pooler (D-009). 5× green E2E local.
- ⚠️ DO FIRST: T-018 — ROTATE the Supabase service_role key (exposed in chat during S11A). Update
  apps/api/.env + GitHub secret. Low risk (dev/private) but rotate-first is the rule.
- ⚠️ BEFORE-LAUNCH debts: T-014 (reconcile cron), T-015 (drain wired, workers STUBS — no real
  kitchen until S12/S13), T-016 (S12/S13 PetPooja/Shadowfax calls must be IDEMPOTENT; clientOrderID
  is the key). T-017 (dead localStorage), T-018 (rotate key). Block go-live, not building.
- PATTERN LOCKED: reads via RLS, writes via API (D-008, no GET /api/orders/:id). DB connectivity =
  session pooler everywhere (D-009; direct host IPv6-only; never :6543 transaction pooler).
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- Prod env: none yet (S14A). RLS read policies live (007). Realtime on orders. pgboss in DEV.
  Frontend still "payment coming soon" (no Razorpay modal). E2E test user test_e2e@… in dev.
- Blockers: PetPooja CREDENTIALS only (callback confirmed, docs in hand, C-03 resolved; staging
  keys needed for S12), Shadowfax/Meta (not started), domain (S16). Razorpay test: HELD.
- Gate 0 COMPLETE. Debt T-006..T-018 (T-004, T-009 resolved). Risk R-005. D-007/D-008/D-009.
- PROCESS: branch-CI-green is the MERGE GATE (worked perfectly S11A — main never red through a long
  CI fight). Memory-file commits on a CLEAN tree. NEVER print secrets in shell. Supabase session in
  COOKIES. On money path verify the DB ROW. CI is the source of truth.
---

## RECENT SESSIONS (last 3 — full history in MASTER §7)
- S11A (MERGED 2026-06-17): FIRST E2E — Playwright critical-path + reusable webhook simulator.
  menu→cart→checkout→simulated payment.captured→/track Placed, headless in CI on every push.
  3 DEV-only scripts (assertSafeTestDb-guarded), @supabase/ssr cookie-injection auth, anti-false-
  green proven. Caught 3 naive-spec errors (no simulator existed, no /login redirect, Razorpay not
  constructed). CI fight: D-009 session-pooler (direct host IPv6-only, runners IPv4) + web -p 3000
  (PORT=4000 leaked into next dev). T-018 (rotate exposed service_role key). Messy merge but content
  correct. Hotspot retired.
- S11 (MERGED 2026-06-16): Order tracking — RLS read policies (007, policies-only) + Realtime UI +
  poll fallback. orders owner-scoped (customer_id=auth.uid()); menu public. /track reads via RLS
  (D-008: no GET route). Verified: anon→0, own→own 3 orders, live advance, offline→poll→restore.
  T-004 resolved, T-017 added.
- S10 (MERGED 2026-06-16): pg-boss queue + outbox drain + STUB workers. order.placed fans to
  pushKot+notify always, +dispatch when delivery. At-least-once, restart-idempotent. config refuses
  :6543. /readyz hotfix. 96 tests. T-015 updated, T-016 added.

## POINTER INDEX
- Schema: arch §6 · State machine: §7 · Idempotency: §8 · Queue: §9 · Outbox: §10
- Env vars: §11 · Endpoints: §12 · Order flow: §13 · Fallbacks: §14 · PetPooja: §17
- Transactions/RPCs: §26 · Zod: §27 · Rate limits: §28 · Reconcile: §30 · Admin sec: §32
- Decisions: MASTER §4 · Cuts: MASTER §5 · Risks: MASTER §8 · Debt: MASTER §9
- Environments: MASTER §10 (+ ENVIRONMENTS.md after S14A) · Integrations: MASTER §11