# MASTER_EXECUTION_CONTEXT.md — YumYumTree
> The archive: everything ever true, decided, broken, or shipped. Append-mostly.
> Read fully by Fable + human; read by Claude Code only when a prompt says "read section X".
> CLAUDE.md is a cache of this file. When they disagree, THIS file wins.

---

## 1. NORTH STAR  (frozen — written once, never edited)
YumYumTree is a direct ordering platform (web, QR dine-in, WhatsApp) for one mandi
restaurant in Hyderabad, replacing Swiggy/Zomato commissions with a system the owner runs
himself. The owner is the paying client; 300–400 orders/day is the design target.
Done = the restaurant takes real paid orders end-to-end (menu → pay → KOT → delivery/serve)
with the owner operating it from the admin dashboard without developer help.

---

## 2. ARCHITECTURE MEMORY  (pointers + load-bearing facts — NOT a copy of the architecture)
Pointers: schema §6 · state machine §7 · idempotency §8 · pg-boss §9 · outbox §10 ·
env §11 · endpoints §12 · order flow §13 · fallbacks §14 · PetPooja §17 · RPCs §26 ·
Zod §27 · rate limits §28 · reconcile §30 · admin security §32.

Load-bearing facts (each has caused or will cause a 2am incident if forgotten):
- Webhook routes MUST mount express.raw BEFORE express.json — signature needs the raw body.
- pg-boss needs the Supabase DIRECT connection string (port 5432), never the 6543 pooler.
- PetPooja API cannot sync add-ons — permanent; extras are modeled as standalone menu items.
- Supabase free tier pauses after ~7 idle days — the menu-sync cron is what keeps it warm.
- Realtime respects RLS — the frontend reads via the anon key, so RLS must exist before S11.
- Razorpay webhooks arrive at-least-once — idempotency by UNIQUE constraint is mandatory.
- PetPooja Apiary docs require JS — unfetchable programmatically; paste real docs at S21.

---

## 3. CONVENTIONS & INVARIANTS  (the enforceable law — mirrored in CLAUDE.md)
INVARIANTS (violation = session fails review)
- orders.status changes ONLY via transition_order RPC. Never a raw UPDATE.
- Prices/totals computed ONLY from DB rows. Client numbers are display hints.
- Every webhook route: express.raw before express.json, HMAC timing-safe verify,
  processed_webhooks dedupe, fast 200.
- Multi-table writes go through a Postgres RPC. No client-side "transactions".
- No console.log (pino only). No secrets/env values in code, logs, or tests.
- No new dependency without "DEPENDENCY APPROVED:" in the session prompt.
- addons are CUT (Register #2): the word in new order-path code is a bug.
- Dev-only routes mount solely under APP_ENV==='development'.
- Tests must be able to fail; .skip/.only never merge.
- RLS deny-all from S1; only S11 adds read policies.
CONVENTIONS
- Errors: { error, code } + correct HTTP status via asyncHandler.
- IDs uuid; money rupees (numeric) in DB, paise (int) only at Razorpay edge.
- File layout per arch §5; tests mirror src; fixtures under src/mocks.
- apps/api CommonJS; apps/web TS strict.

---

## 4. DECISIONS REGISTER  (append-only, numbered, four lines each)
D-001 · 2026-06-XX · Stack frozen: Next.js/Vercel + Express/Railway + Supabase + Razorpay
        + Shadowfax + PetPooja + Meta WhatsApp direct.
  Why: lowest fixed cost (~₹892/mo) at 300–400 orders/day vs aggregator commissions.
  Revisit-if: sustained scale >100 orders/day for multiple branches.
  Decided-by: Fable proposal, human approved.
D-002 · 2026-06-XX · pg-boss over Redis/BullMQ for the job queue.
  Why: same-transaction enqueue kills the lost-job class; zero new infra.
  Revisit-if: sustained >50 jobs/sec (≈100x current scale).
  Decided-by: Fable proposal, human approved.
D-003 · 2026-06-XX · Two environments only (DEV local + dev-Supabase / PROD Railway +
        prod-Supabase). No dev Railway, no third staging project.
  Why: Supabase free tier caps at 2 projects; local dev beats a hosted dev box for 1 dev.
  Revisit-if: team grows or a true pre-prod rehearsal env becomes necessary.
  Decided-by: Roadmap V2 Patch (R1/R2), human approved.
D-004 · 2026-06-XX · customers.id == Supabase auth uid (set at S6).
  Why: one identity, no mapping table, simplest upsert-on-first-auth.
  Revisit-if: ever need non-auth (guest) customers persisted.
  Decided-by: roadmap S6 spec.
D-005 · 2026-06-13 · apps/web scaffolded on Next.js 16 (docs say "Next 14").
  Why: original scaffold was lost/uncommitted; create-next-app installs current stable (16).
  App Router + server components unchanged from 14; no roadmap impact. Also pinned CI/runtime
  to Node 22+ (native WebSocket — supabase-js realtime requirement).
  Revisit-if: a Next 16 breaking change bites a later frontend session.
  Decided-by: Fable proposal, human approved.
D-006 · 2026-06-13 · Zod schemas + domain types live in apps/api; NO packages/types workspace.
  Why: no second consumer yet (frontend/admin don't consume them). Handbook: extract shared
  infra only when ≥2 real consumers exist. Avoids premature monorepo machinery.
  Revisit-if: S8 (checkout) or S20 (admin) needs client-side schema reuse → extract then.
  Decided-by: human decision, Fable concurred (resolves PE review finding X1).

---

## 5. CUTS REGISTER  (append-only, owner-signed; a cut without a signature is a forgotten feature)
C-01 · v1 CUT: proactive customer notifications (SMS/WhatsApp status alerts) for web/QR.
  v1 substitute: live tracking link; WhatsApp-channel orders get a confirmation in S24.
  Revisit: v1.1.   Owner sign-off: OWNER OK via WhatsApp, 2026-06-13.
C-02 · v1 CUT: add-on machinery (menu_addons UI/pricing/sync) removed from the order path.
  v1 substitute: extras listed as standalone PetPooja menu items ("Extra Raita ₹30") that
  sync automatically. menu_addons table stays dormant.
  Revisit: v1.1.   Owner sign-off: OWNER OK via WhatsApp, 2026-06-13.
C-03 · Kitchen progression model (preparing→ready driver): callback vs KDS-tablet.
  Status: UNDECIDED — depends on PetPooja's answer to the D2 callback question.
  To be filled before S21.   Owner sign-off: <pending PetPooja reply>.

---

## 6. CURRENT STATE  (the ONLY fully-rewritten section — ≤10 lines)
- Phase B (Menu + Cart) IN PROGRESS. Sessions: S1, S2, S2A, S3, S4 all MERGED. Next:
  Session 5 (frontend menu browse + cart — consumes GET /api/menu; web CI job un-parks here).
- main clean + pushed (5d1da98). CI green on Node 22. Full suite 62 tests. GET /api/menu LIVE
  (mock-backed, serves the real YumYumTree menu — 9 cats, 82 items). Provider seam pattern set.
- Prod env: none yet (S14A). CI repo secrets: not added (DB test skips in CI by design).
- Blockers: PetPooja creds + callback (chase 2026-06-18) · Shadowfax (not started) ·
  Meta (not started) · Razorpay (test mode on demand) · domain yumyumtree.in not owned (S16).
- Gate 0: COMPLETE. Debt: T-006 (vitest audit), T-007 (CI action deprec.), T-008 (tz),
  T-009 (menu category_ref contract). Risk R-005 (app/DB whitelist lockstep).
- PROCESS: PowerShell git one line at a time (no && / ||). Branch BEFORE Claude Code.
  CI on Node 22 is the source of truth. NEXT: S5 is frontend — web CI job un-parks, Next 16.

---

## 7. SESSION HISTORY  (append-only spine — includes failed sessions with their why)

### Session 1 — Database schema + RPCs  ·  MERGED 2026-06-13
- Full schema deployed (all 13 tables): orders, order_items, menu_addons, tables,
  order_events, processed_webhooks, outbox, loyalty_transactions, menu_sync_log,
  whatsapp_sessions (+ the 3 pre-existing). Migrations 001–005 in apps/api/db/migrations/,
  idempotent, run manually in the Supabase SQL editor (runner arrives S14A).
- Idempotency DB-enforced: UNIQUE(idempotency_key), partial UNIQUE(razorpay_payment_id)
  WHERE NOT NULL, UNIQUE(source,event_id,event_type) on processed_webhooks,
  UNIQUE(order_id) on loyalty_transactions.
- State machine enforced inside transition_order() — verified live: placed→delivered RAISEs
  'Invalid transition'. confirm_order() verified idempotent (duplicate webhook → count 1).
- RLS enabled deny-all on ALL 13 tables (zero policies; V2 Patch O1). Verified: all
  rowsecurity=true. Read policies deferred to S11.
- Realtime enabled on orders + menu_items.

### Session 2 — Backend platform hardening + Vitest harness  ·  MERGED 2026-06-13
- Fail-fast config (src/config.js): required vars [PORT, FRONTEND_URL, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, APP_ENV] validated at import; APP_ENV ∈ {development,test,
  production}; production-asserts NODE_ENV (V2 Patch C2). Optional §11 vars warn-only.
- pino logger (no console.log anywhere — verified by grep). Service-role Supabase client
  (backend only, no session persistence). asyncHandler + errorHandler ({error,code} contract).
- app.js restructured: cors, the commented raw-body-before-json webhook placeholder (§8),
  express.json, GET /health, GET /readyz (real DB ping → 503 {db:down} on failure), error
  handler last.
- Vitest + Supertest harness; assertSafeTestDb() prod-fence (V2 Patch T2: refuses
  APP_ENV=production or SUPABASE_URL host == PROD_DB_HOST). 2 tests green vs live DEV DB.
  __tests__/README.md documents the test_-prefix + afterAll-cleanup isolation strategy.
- Deviations (all sound): node --watch instead of nodemon (no dep approved); vitest globals
  (globals:true) instead of require('vitest') (vitest API is ESM-only); logger reads
  process.env.APP_ENV directly to break a config↔logger cycle.
- Added root .gitignore (closed a .env leak risk) + apps/api/.env.example.
- PROCESS NOTE: Claude built on main then self-created the branch; from S2A the branch is
  created BEFORE the Claude Code conversation and the prompt forbids git operations.

### Session 2A — CI pipeline (GitHub Actions)  ·  MERGED 2026-06-13
- .github/workflows/ci.yml: api job (Node 22, npm cache) runs Vitest on push + PRs to main.
  CI_HAS_DEV_DB = (secrets.SUPABASE_URL != '') gates the DB test — real DEV creds injected
  when present (test runs), non-secret placeholders otherwise (DB test skips via
  it.skipIf(CI_HAS_DEV_DB==='false'), /health always runs). No npm audit gating (T-006).
  README CI badge added. Per-app install (no root workspaces package.json).
- web job PARKED as a ready-to-uncomment scaffold; enable when frontend work begins (S5).
- IN-SESSION BUG, caught by CI, fixed and re-verified green (the system working as designed):
  CI initially RED. Root cause: pinned Node 20 lacks native WebSocket; @supabase/supabase-js
  RealtimeClient requires it (Node 22+). Passed locally (Node 24), failed only in CI — pure
  environment drift. Fix (T4, minimal): CI Node 20→22 in ci.yml (api + parked web) + README.
  No app code touched, no ws dependency. Re-run → green (1 passed | 1 skipped). Lesson: CI on
  Node 22 is now the source of truth; local Node 24 is not authoritative.
- apps/web RE-SCAFFOLDED this session: the original create-next-app scaffold from initial
  setup was never committed (git ls-tree of first commit shows no web/) and was absent from
  disk. Re-created via create-next-app on Next.js 16 (see D-005), + S5 frontend deps
  (@supabase/supabase-js, @supabase/ssr, zustand, react-hot-toast, lucide-react). npm run
  build passed. Committed separately as chore(web): scaffold.

### Session 3 — Domain core (state machine, Zod schemas, pricing)  ·  MERGED 2026-06-13
- Pure application-layer logic, no DB/routes/external calls, all in apps/api (lean path — see
  D-006: no packages/types workspace yet). Added zod@^3 (approved).
- domain/orderStateMachine.js: VALID_TRANSITIONS frozen, mirrors §7 whitelist EXACTLY
  (diffed line-by-line). assertTransition → {status:422, code:INVALID_TRANSITION};
  allowedTransitions (returns a .slice() copy — mutation-safe, tested); isTerminal.
  This is the fail-fast app guard; the DB transition_order RPC remains ultimate enforcer.
- schemas/order.js: strict Zod (unknown keys rejected at every level). OrderItemSchema has
  NO addons field (C-02); CreateOrderSchema per §27 minus addons & loyalty-math; cross-field
  refines (delivery→address, dine_in→table_id); same-day scheduled_at; Hyderabad bbox
  (lat 17-18, lng 78-79). loyalty_points_to_redeem kept as valid input (service rejects until
  S17). JSDoc typedefs, no TypeScript in apps/api.
- services/pricing.js: pure computeTotals(items, priceMap) — verified zero imports. Price
  SNAPSHOT from priceMap (test proves a client-supplied price:1 is ignored, uses DB 280);
  ITEM_NOT_FOUND / ITEM_UNAVAILABLE (422); 2-decimal rupee rounding (3×33.33=99.99). No paise
  (Razorpay edge only), no discount/total (loyalty=S17) — subtotal only.
- 50 new unit tests (state machine 30, schema 14, pricing 6); full suite 52 green.
  Mutation-checked: breaking the transition guard produced 10 failures, then reverted → green.
- Concerns logged: T-008 (scheduled_at same-day refine uses server-local time — must be IST
  before scheduling goes live), R-005 (app mirror ⇄ DB RPC whitelist must stay in lockstep).
- PARKED: none.

### Session 4 — Menu API + mock PetPooja provider seam  ·  MERGED 2026-06-14
- First real route + first mock-behind-a-flag provider (the template every external
  integration copies). No DB writes — mock serves a seed; real PetPooja→DB sync is S21.
- mocks/petpooja/menu.js: the REAL YumYumTree menu seed (owner's actual menu, transcribed
  from 5 menu photos). 9 categories, 82 items. Half/Full modeled as separate items (owner
  decision, matches PetPooja). MRP items priced as placeholders (Mineral Water 20, Soft
  Drinks 40 — editable via PetPooja later). category_ref = parent category's petpooja_id.
  Addons excluded (C-02); note the menu's own "Extras" section lists Fried Onion/Mayo/Cheese
  as standalone items — reality validates the C-02 cut.
- services/petpooja.js: THE SEAM. getMenu() returns seed in mock mode (50-150ms jitter);
  live mode throws {status:501, code:NOT_IMPLEMENTED} until S21 — never a silent fallback.
  MODE from config.PETPOOJA_MODE (default 'mock'). Thin getCategories/getItems wrappers.
- routes/menu.js: GET /api/menu, PUBLIC, asyncHandler. Filtering lives in the ROUTE (service
  stays a faithful provider mirror): excludes is_active=false categories + their items;
  KEEPS unavailable items with the flag (frontend renders "sold out"). config.js
  (PETPOOJA_MODE → OPTIONAL) + app.js (mount after express.json) edited.
- Tests: menu.test.js (6 integration, incl. a spy-injected inactive-category test that fails
  on broken code) + petpooja.test.js (4 unit, mock-mode + price spot-checks). Suite 62 green.
- Verified LIVE: booted server, GET /api/menu returned the full real menu as JSON; prices
  cross-checked against the menu photos — all correct.
- Concern logged (T-009): category_ref is the petpooja_id seam; S21's DB version uses
  category_id (uuid FK). Frontend must group on whatever key §12 exposes — keep category_ref
  stable or version the contract when S21 swaps to DB-backed reads.
- PARKED: caching/ISR/Redis on /api/menu; real PetPooja HTTP sync (S21); menu admin/editing.

---

## 8. OPEN RISKS  (R-### · risk · likelihood/impact · trigger-to-watch · owner · status)
R-001 · External blockers (PetPooja/Shadowfax/Meta/Razorpay) slip the launch · med/high ·
  any partner with no reply >7 days · human · OPEN — chase weekly, dates in §11.
R-002 · Plausible-but-wrong code in money/crypto paths · med/high · review unease on a
  webhook/RPC diff · human+Fable · OPEN — mitigated by line-by-line review + simulators.
R-003 · Velocity addiction thins manual testing over months · med/high · 2+ escapes from
  one session · human · OPEN — 2-sessions/day cap, paper checklists.
R-004 · Team-of-one bus factor · low/high · Current State stale >3 days · human · OPEN —
  runbooks written so owner/Anudeep could operate prod.
R-005 · App state-machine mirror (domain/orderStateMachine.js) and DB transition_order RPC
  can drift · low/high · a §7 change touching only one side · human+Fable · OPEN — change
  both together; consider a shared fixture/cross-check when S7 wires the route.

---

## 9. KNOWN TECHNICAL DEBT  (T-### · what · where · cost-of-ignoring · planned-repayment)
T-001 · Phone-OTP login UI ships disabled (no SMS provider funded) · apps/web /login ·
  customers limited to Google sign-in · repay: pre-launch provider decision.
T-002 · place_order / redeem_loyalty / award_loyalty / admin_transition_order RPCs not built ·
  apps/api/db · none (scheduled) · repay: S7 / S17 / S19 as specced.
T-003 · admin_audit_log table not built · apps/api/db · none (scheduled) · repay: S18.
T-004 · RLS read policies absent (deny-all only) · all tables · frontend can't read via anon
  key yet (intended) · repay: S11.
T-005 · No checksummed migration ledger; SQL run by hand · apps/api/db · drift risk across
  envs · repay: S14A (scripts/migrate.js + schema_migrations).
T-006 · 5 npm-audit advisories (1 crit/1 high) in vitest→esbuild/vite chain · apps/api ·
  devDependency only, NOT in runtime path · repay: S2A (pin or bump vitest deliberately).
T-007 · CI uses actions/checkout@v4 + setup-node@v4 (Node-20 action runtime, deprecated;
  GitHub forces Node 24 by 2026-06-16) · .github/workflows/ci.yml · non-blocking warning ·
  repay: bump to @v5 actions when stable. (NOTE: T-006 reviewed at S2A — left parked, audit
  not gated in CI; revisit only if vitest bumped.)
T-008 · scheduled_at same-day refine uses server-local time · apps/api/src/schemas/order.js ·
  'later today' could mean wrong day if server isn't IST · repay: before scheduling goes live,
  pin comparison to Asia/Kolkata or ensure server runs IST.
T-009 · GET /api/menu exposes category_ref (petpooja_id text) · apps/api/src/routes/menu.js ·
  S21's DB-backed version uses category_id (uuid FK); contract key could shift · repay at S21:
  keep category_ref stable or version the §12 payload so the frontend grouping doesn't break.
(more accrue as PARKED items from sessions)

---

## 10. ENVIRONMENT MODEL  (rewritten on change; change noted in §12 Deployment History)
- DEV: local Express (:4000) + local Next (:3000) + Supabase DEV project (Mumbai).
  Secrets in local .env / .env.local only.
- PROD: does not exist yet. Created at S14A (Supabase PROD project + Railway + Vercel Prod).
  Vercel Preview will read PROD with NEXT_PUBLIC_DISABLE_CHECKOUT=true.
- Migration ledger: SQL-editor application until S14A introduces scripts/migrate.js +
  schema_migrations (checksummed). PROD_DB_HOST (set at S14A) fences tests/simulators.
- Key placement: SUPABASE_SERVICE_ROLE_KEY backend only; NEXT_PUBLIC_* only on web.

---

## 11. EXTERNAL INTEGRATION STATUS  (one block per partner — why blockers get chased)
- PetPooja · creds held: NO · mode: mock · last contact: API-access email + callback
  question sent 2026-06-13 · next chase: 2026-06-18 · note: confirm callback support (C-03).
- Shadowfax · creds: NO · mode: mock · onboarding: not started · next chase: when Phase E nears.
- Meta WhatsApp · creds: NO · Business Manager: not created · next: before S23.
- Razorpay · test mode: available on demand · live: KYC not started (S15A) · note: live
  activation needs legal pages (S15A) — start KYC there to run review in parallel.
- Domain (yumyumtree.in) · owned: NO · required before S16 (QR print lock, finding O3).

---

## 12. DEPLOYMENT HISTORY  (append-only: date · sha · sessions · migrations · smoke · rollbacks)
(none yet — first deploy is Session 15)

---

## 13. PHASE RETROSPECTIVES  (one paragraph at each phase boundary)

### Phase A (Foundation) — S1, S2, S2A, S3 · complete 2026-06-13
What we built: the full DB schema with DB-enforced idempotency + state machine + RLS deny-all
(S1), the hardened backend platform with fail-fast config and a real test harness (S2), live
CI on GitHub Actions (S2A), and the pure domain core — state-machine mirror, strict Zod
schemas, pricing (S3). 52 tests green; everything mock/local, nothing deployed yet.
What surprised us: environment drift bit twice, both from Node versions — vitest's ESM-only
API in S2, and the Node-20-no-WebSocket crash CI caught in S2A (invisible on local Node 24).
Lesson banked: CI on Node 22 is now the source of truth, not local. Also: apps/web was lost
(never committed in initial setup) and had to be re-scaffolded on Next 16 — a reminder that
"it ran once locally" ≠ "it's in the repo."
What Phase B should fear: S4 is the first real route and first mock-provider; from here code
touches the DB through the service-role client. The discipline that matters next is the
mock-behind-a-flag pattern (so PetPooja/Shadowfax stay swappable) and keeping the money path's
review rigor high as routes start carrying real logic.