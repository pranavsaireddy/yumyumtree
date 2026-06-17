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
- pg-boss connection / IPv6: the Supabase DIRECT db host (db.<ref>:5432) is IPv6-ONLY (AAAA). Any
  IPv4-only environment (the dev's Airtel ethernet AND GitHub CI runners) gets connect ENETUNREACH
  → api process.exit(1) on boot (proven S11A: `ENETUNREACH 2406:da1a:...:5432`). SOLUTION (in force
  since S11A): use the Supabase SESSION POOLER everywhere — aws-0-<region>.pooler.supabase.com:5432,
  user postgres.<ref> — IPv4-reachable AND session-mode (pg-boss-compatible), :5432 passes the
  config guard. DATABASE_URL = session-pooler string in local apps/api/.env AND the GitHub secret.
  NEVER the :6543 transaction pooler (breaks pg-boss; config.js refuses it). This RETIRES the old
  mobile-hotspot workaround — ethernet works everywhere now. [Detail in CLAUDE.md → LOCAL ENV.]
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
D-007 · 2026-06-14 · Google sign-in only; login required at checkout (S8); NO guest checkout.
  Why: guest checkout conflicts with customers.id==auth uid (orders.customer_id FK, tracking,
  loyalty, RLS all assume an authed identity). Browse+cart already anonymous, so friction is
  low; accounts drive the repeat-business loyalty is built for. Phone OTP/email/guest = later.
  Revisit-if: owner wants guest checkout → its own session, design nullable customer_id or
  shadow-row model + tracking/loyalty/RLS adaptations first.
  Decided-by: human decision (Option A), Fable flagged the conflict + recommended it.

D-008 · 2026-06-16 · NO GET /api/orders/:id backend route. Customer-facing single-order reads
  go through the Supabase browser client (anon key) using the orders_select_own RLS SELECT
  policy (007), which scopes to customer_id=auth.uid(). Pattern locked: READS VIA RLS, WRITES
  VIA THE API. Why: S11's whole purpose was to prove safe direct RLS reads; a GET route would
  duplicate that surface and expand scope. (The S11 prompt wrongly claimed the GET route
  "already exists from S7" — it never did; S7 built only POST /api/orders. Claude Code caught
  the false premise and asked; human ruled RLS-read.) Two RLS properties this depends on:
  (1) read requires an authenticated session (policy is TO authenticated; auth.uid() null →
  zero rows) — a logged-out visitor on a track link is sent to Google sign-in, not "not found";
  (2) nonexistent and foreign orders BOTH return zero rows and MUST show the SAME "not found"
  screen — never distinguish them (distinguishing leaks existence).
  Revisit-if: a future need for a customer to read own orders from the frontend → add/extend an
  RLS SELECT policy + read via the browser client. Do NOT add a backend GET route.
  Decided-by: human ruling mid-S11; Fable concurred (RLS-read is the faithful realization of the
  session's design, not a deviation).

D-009 · 2026-06-17 · DATABASE_URL = Supabase SESSION POOLER everywhere (local + CI), not the
  direct host. Why: pg-boss needs a direct PG session (5432, session-mode for LISTEN/NOTIFY +
  advisory locks); Supabase's DIRECT host (db.<ref>:5432) is IPv6-ONLY, and IPv4-only environments
  (dev's Airtel ethernet AND GitHub CI runners) get connect ENETUNREACH → api process.exit(1) on
  boot (proven S11A: `ENETUNREACH 2406:da1a:...:5432`). The SESSION pooler (aws-0-<region>.pooler.
  supabase.com:5432, user postgres.<ref>) is IPv4-reachable AND session-mode AND :5432 (passes the
  config guard, which only refuses the :6543 TRANSACTION pooler — transaction mode breaks pg-boss).
  RETIRES the mobile-hotspot workaround — ethernet works everywhere now (verified). Prod (Railway,
  S14A) has IPv6 so MAY use direct, but the pooler works there too (simpler single string).
  Revisit-if: pooler connection-cap pressure under real load (unlikely at this scale) → IPv4 add-on
  or per-env tuning.
  Decided-by: Fable proposal after the CI ENETUNREACH dump; human applied + verified on ethernet.

---

## 5. CUTS REGISTER  (append-only, owner-signed; a cut without a signature is a forgotten feature)
C-01 · v1 CUT: proactive customer notifications (SMS/WhatsApp status alerts) for web/QR.
  v1 substitute: live tracking link; WhatsApp-channel orders get a confirmation in S24.
  Revisit: v1.1.   Owner sign-off: OWNER OK via WhatsApp, 2026-06-13.
C-02 · v1 CUT: add-on machinery (menu_addons UI/pricing/sync) removed from the order path.
  v1 substitute: extras listed as standalone PetPooja menu items ("Extra Raita ₹30") that
  sync automatically. menu_addons table stays dormant.
  Revisit: v1.1.   Owner sign-off: OWNER OK via WhatsApp, 2026-06-13.
C-03 · ~~UNDECIDED~~ → RESOLVED 2026-06-16 · Kitchen progression driven by PetPooja CALLBACK
  (push), not KDS-tablet/polling. PetPooja confirmed (email + API docs v2.1.0, saved as
  PetPooja_API_Docs_v2.1.0.pdf): pass a `callback_url` in each /saveorder payload; PetPooja POSTs
  status to our /callback endpoint. Status codes: -1=Cancelled, 1/2/3=Accepted, 4=Dispatch,
  5=Food Ready, 10=Delivered (+ cancel_reason, minimum_prep_time, rider name/phone for self-
  delivery). This is the push model the architecture preferred — no status polling needed. The
  preparing→ready transitions are now driven by mapping these callback codes onto the §7 state
  machine (S12 builds the translation layer). Owner sign-off: design decision, no owner cut needed.

---

## 6. CURRENT STATE  (the ONLY fully-rewritten section — ≤10 lines)
- Phase D/E (fulfilment, mocked). S1–S11A MERGED + main green (9316c61). Money path is now
  GUARDED BY AN AUTOMATED E2E in CI on every push (menu→cart→checkout→simulated webhook→/track
  reaches Placed). Next: S12 (real PetPooja KOT — swap the pushKot stub for the live /saveorder).
- CI now has 3 jobs (api vitest, web lint+build, e2e playwright) — all green on main. Local: api
  boots on ETHERNET via the session pooler (D-009; mobile-hotspot retired). 5× green E2E local.
- DB CONNECTIVITY (D-009): DATABASE_URL = SESSION POOLER everywhere (aws-0-…pooler:5432, IPv4,
  session-mode). Direct host is IPv6-only → unreachable from IPv4 nets (ethernet, CI runners).
  NEVER the :6543 transaction pooler (breaks pg-boss; config refuses it). [CLAUDE.md → LOCAL ENV.]
- ⚠️ BEFORE-LAUNCH debts: T-014 (reconcile cron), T-015 (drain wired, workers STUBS — no real
  kitchen until S12/S13), T-016 (S12/S13 must make PetPooja/Shadowfax calls IDEMPOTENT — drain is
  at-least-once; clientOrderID is the key). T-017 (dead localStorage).
- TEAM: SOLO build — Pranav owns backend and frontend. No Anudeep.
- Prod env: none yet (S14A). RLS read policies live (007). Realtime on orders. pgboss schema in DEV.
  Frontend still shows "payment coming soon" (no Razorpay modal). E2E test user test_e2e@… in dev.
- Blockers: PetPooja CREDENTIALS only (callback CONFIRMED + docs v2.1.0 in hand, C-03 resolved;
  staging keys needed for S12 KOT live test). Shadowfax/Meta (not started). domain (S16). Razorpay test: HELD.
- Gate 0 COMPLETE. Debt T-006..T-018 (T-004, T-009, T-018 resolved). Risk R-005. D-007/D-008/D-009.
- PROCESS: branch-CI-green is the MERGE GATE (worked perfectly in S11A — main never went red
  through a long CI fight). Squash to main only after branch green. Do memory-file commits on a
  CLEAN tree (uncommitted memory edits caused the S11A merge tangle). NEVER print secrets in shell
  commands. PowerShell git one line at a time; probes via Invoke-RestMethod/-UseBasicParsing. On
  money path verify the DB ROW. CI is the source of truth.

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

### Session 5 — Frontend menu browse + cart (display-only)  ·  MERGED 2026-06-14
- FIRST frontend session. All in apps/web (Next 16 App Router, TS, Tailwind v4). web CI job
  UN-PARKED — both api + web jobs now green on every push.
- Server/client boundary (the key thing, done right): menu page + layout + Header +
  MenuItemCard + VegBadge + lib/menu.ts are SERVER components (server-side fetch of GET
  /api/menu with cache:'no-store'; no useEffect, no client menu fetch). Client islands
  ('use client'): store/cart.ts, store/cart-ui.ts, AddToCartButton, CartButton, CartPanel,
  CartBar.
- lib/menu.ts: typed getMenu() returns null on any failure (API-down → friendly "menu
  temporarily unavailable", never crashes render); toSections() groups flat items by
  category_ref + sorts; formatPrice() (₹, en-IN grouping).
- Cart: in-memory Zustand, NO persistence (vanishes on refresh — correct for S5). Per-card
  Add swaps to −/qty/+ stepper. Desktop right-side drawer; mobile sticky bottom bar (only when
  non-empty) → slide-up sheet. SUBTOTAL IS DISPLAY-ONLY (commented in store + UI); cart holds/
  sends no authoritative price; checkout is a disabled stub. Authoritative total = server-side
  at checkout (later session sends item_id+quantity, never price).
- Brand: navy #0A1A3F + gold #D4AF37 chrome over cream #F5F0E6 menu body; palette as Tailwind
  v4 @theme tokens. Logo at apps/web/public/logo.png (239×240 — low-res screenshot, see T-010).
- Tailwind v4 gotcha caught & fixed: runtime-built class names (border-${color}) aren't
  scanned — VegBadge rewritten with literal class strings.
- Verified by human: lint clean, build green, both CI jobs green, AND personally tested
  desktop + mobile (375px) — menu renders, cart drawer/sheet/bar all work, nothing clipped.
- frontend-design skill NOT present in workspace — Claude used own design judgment (palette
  came from the logo via prompt). Visual style is Claude's taste, human-approved.
- PARKED: none.

### Session 6 — Google sign-in (Supabase OAuth) + customer sync  ·  MERGED 2026-06-14
- Auth CAPABILITY only — nothing is gated in S6 (browse + cart stay anonymous; checkout gate
  is S8). Google sign-in ONLY (phone OTP / email / guest = "coming soon"). Guest checkout
  DROPPED for now (conflicts with customers.id==auth uid; revisit as its own session if owner
  wants it — would need nullable customer_id or shadow-row model). RLS stays DENY-ALL.
- apps/web: @supabase/ssr (v0.12, getAll/setAll cookie API verified against installed types).
  lib/supabase/client.ts (browser) + server.ts (server, async cookies()). AuthButton.tsx
  ('use client' island) rendered ALONGSIDE CartButton — Header stays a server component.
  app/auth/callback/route.ts (GET): exchangeCodeForSession → best-effort POST to backend sync
  → redirect home. Open-redirect guard on ?next (relative-only). NO service-role key in web
  (grep-verified). NO middleware added (deferred — S8 needs it for server-side auth reads).
- apps/api: POST /api/auth/sync (routes/auth.js) — SECURITY-CRITICAL. Reads Bearer access
  token, verifies via supabase.auth.getUser(token), derives identity ONLY from the verified
  user (request body NEVER read for identity). Upserts customers (id=uid, email, name) via
  service-role (bypasses deny-all). 401 UNAUTHENTICATED on missing/invalid token; 502
  CUSTOMER_SYNC_FAILED on upsert error. Idempotent (safe to re-run every login).
- Tests: auth.test.js — 4 (no header→401; invalid token→401; valid token→200 with upsert
  using TOKEN identity while a spoofed body id/email is proven IGNORED; upsert error→502).
  Suite 66 green. web lint + build pass (/auth/callback route emitted).
- Verified by human: real Google login works (header updates, customers row created with
  id==auth uid — D-004 confirmed live); BOTH forge attempts (no token / fake token+attacker
  body) returned 401 with NO attacker row created; re-login idempotent (no duplicate row).
- INCIDENT (benign): session opened with an uncommitted local edit to app.js that had deleted
  the /api/menu mount (working-tree ghost only — main always had it; git diff main confirmed
  the mount line unchanged vs main). Claude restored it while adding the auth mount. No code/
  repo damage. PROCESS REMINDER reinforced: run `git status` to confirm a clean tree BEFORE
  starting each session (handbook Stage 1 already requires this).
- Concerns for S7/S8: add @supabase/ssr middleware when server-side auth reads are first
  needed (S8 checkout gate); RLS read policies for customer-owned rows land at S11; surface
  the ?auth=error callback state as a toast in a later UI pass.
- PARKED: none.

### Session 7 — Order creation (POST /api/orders) + menu seed  ·  MERGED 2026-06-14
- FIRST MONEY-PATH session. Part A (seed) + Part B (order creation), all apps/api.
- Part A — scripts/seedMenu.js (manual, human-run): upserts the S4 mock menu into the DEV DB
  (menu_categories + menu_items), mapping category_ref(text) → category_id(uuid FK). Idempotent
  on UNIQUE petpooja_id. RAN by human: 9 categories, 88 items, 0 null category_id, stable on
  re-run. Resolves T-009.
- Part B — POST /api/orders (routes/orders.js). The four money-path guarantees, all verified
  LIVE against the real DB:
  1. TOTAL server-side only — fetches menu_items by uuid id, computeTotals (S3); client price
     rejected by strict schema (verified: body price:1 → 422 "Unrecognized key 'price'").
  2. IDENTITY from verified token only — getUser(token)→uid as customer_id; body customer_id
     rejected by strict schema. No token → 401 (both verified live).
  3. IDEMPOTENCY by DB constraint — place_order RPC (migration 006) ON CONFLICT(idempotency_key)
     DO NOTHING + a route pre-check; replay returns SAME order, one Razorpay order (verified
     live: same order_id + razorpay_order_id on second call, one DB row).
  4. ATOMICITY — order + order_items in one place_order txn; order_items snapshot name+price (§6).
- Razorpay STUB (services/razorpay.js, RAZORPAY_MODE default mock) — fake order_mock_* in mock,
  501 in live (real API a later session). amount in PAISE only at this edge; DB in rupees.
- discount=0, total=subtotal (loyalty=S17; loyalty_points_to_redeem>0 → 422).
- 80 tests green (+14: 11 orders integration, 3 razorpay unit). Migration 006 + seed run by
  human in Supabase (see Deployment History). Verified live order be0ee15c… customer_id=auth
  uid 88ebbf16…, total 998, order_items price snapshot 499×2.
- DEBT logged T-011: idempotency race — concurrent same-key submits can both pass the route
  pre-check and each create a Razorpay order before place_order collapses them to one DB order
  (one orphaned UNPAID Razorpay order; DB never double-orders; reconcile §30 sweeps it).
  Accepted for S7 (orphan is a free mock object today); revisit at the real-Razorpay session.
- DETOUR (resolved, no code impact): S7 manual test initially used a stale localStorage token
  (test1/id:35) — inert leftover keys; the real Supabase session lives in cookies
  (sb-…-auth-token, chunked .0/.1), not localStorage. S6 auth was fine all along.
- Concerns for S8/S9: S8 frontend generates idempotency_key per attempt, consumes
  {order_id, razorpay_order_id, amount(paise), currency}; add @supabase/ssr middleware when S8
  needs server-side auth. S9 (payment webhook) uses confirm_order (005), handles lost-webhook +
  orphan via reconcile.
- PARKED: none.

### Session 8 — Menu API DB-read + delivery checkout (cart→order)  ·  MERGED 2026-06-15
- Two parts, one session (folded by owner), apps/api (A) + apps/web (B), with a human
  verification gate between them (menu must render identically before B was built).
- Part A (S8A) — GET /api/menu reads the DB: petpooja.getMenuFromDb() queries menu_categories +
  menu_items (service-role) instead of the mock seed, so items now carry their real uuid `id`.
  Response exposes BOTH ids: categories {id, petpooja_id, …}; items {id (uuid), petpooja_id,
  category_id (uuid), category_ref (text, backward-compat), …}. DB numeric price coerced via
  Number(). Visibility filtering unchanged + route-owned. Mock seam INTACT (getMenu() + seedMenu
  untouched; petpooja unit test still green). menu.test.js rewritten to mock supabase client.
  81 tests. RESOLVES T-009 (category_ref → category_id contract).
- Part B (S8B) — delivery checkout: cart now keyed by uuid `id` (not petpooja_id); menu page
  groups by category_id. New /checkout client page: client-side login gate (D-007 — getSession +
  onAuthStateChange; no session → Google OAuth redirectTo /auth/callback?next=/checkout); empty-
  cart + success states; address form (line1≥5, city≥2, pincode /^\d{6}$/) with INJECTED
  placeholder lat 17.385 / lng 78.4867 (customer never enters coords). Place Order → POST
  /api/orders with Bearer token, body {idempotency_key, items:[{item_id:uuid, quantity}],
  order_type:'delivery', delivery_address} — NEVER price, NEVER customer_id. idempotency_key
  per attempt, reset on cart-content change (useEffect on cart signature), cleared on success.
  200/201 → clear cart + "Order placed! payment coming soon" + order_id; 401→re-login, 422→inline
  error, network→friendly error (all keep cart); button disabled in-flight. CartPanel "Checkout"
  wired to router.push('/checkout') (drawer + sheet). STOPS at order creation — Razorpay modal +
  webhook = S9 (razorpay_order_id/amount ignored client-side for now).
- CART PERSISTENCE added (was the bug that surfaced: OAuth full-page redirect wiped the in-memory
  cart, so a logged-out user lost their cart at sign-in). zustand persist middleware: key
  'yyt-cart', version 1, partialize to lines only, skipHydration:true + one-time
  useCartStore.persist.rehydrate() in the always-mounted CartPanel (SSR-safe, no hydration
  mismatch). UI state (cart-ui.ts) stays in-memory. Fulfils arch §19 ("persisted, versioned").
- Verified live end-to-end by human: logged-out → fill cart → Checkout → sign-in gate → Google →
  back to /checkout with cart INTACT (persistence working) → address → Place Order → "Order
  placed!" (order 97b3c311…) → cart cleared. lint + build green, CI green.
- DEBT logged: T-012 (real geocoding/map — placeholder lat-lng must become real before delivery-
  radius enforcement or Shadowfax), T-013 (@supabase/ssr middleware — checkout gate is client-side
  only this session; server-side wall + protected routes still needed). T-009 RESOLVED (struck).
- Concerns for S9: success state needs the Razorpay modal driven by razorpay_order_id + amount
  from the same response; idempotency-key-on-mutated-cart now handled client-side but T-011
  (server-side race) still stands; client-side gate is UX not security (server still enforces).
- PARKED: none.

### Session 9 — Razorpay payment webhook (POST /payments/webhook)  ·  MERGED 2026-06-15
- FIRST WEBHOOK + SECOND money-path. apps/api only. Real Razorpay HMAC verification (test keys
  in .env). The money loop now closes: customer pays → order confirms.
- SECURITY (all verified live): express.raw({type:'application/json'}) mounted BEFORE
  express.json() on /payments/webhook (gotcha #1) — handler verifies HMAC-SHA256 over the raw
  Buffer, JSON.parses only AFTER. Timing-safe compare (crypto.timingSafeEqual, length-guarded).
  Missing/invalid signature → 400 INVALID_SIGNATURE, nothing downstream runs (only pre-verify
  failures are 4xx; every post-verify outcome is 200 so Razorpay stops retrying).
- razorpay.verifyWebhookSignature(rawBody, signature, secret) added — runs in BOTH mock+live
  (security is real regardless of createOrder's mode); createOrder seam + its tests untouched.
- FLOW: payment.captured → dedup (processed_webhooks pre-check) → lookup order by
  razorpay_order_id → AMOUNT CHECK (payment.amount paise == round(order.total×100)) → confirm_order.
  Non-captured event / orphan order / amount mismatch → 200 ack, NOT confirmed (logged/flagged).
- confirm_order (mig 005) wired for the FIRST TIME — Step 0 of the prompt had Claude READ it and
  confirm param/dedup/guard MATCH before wiring (it matched exactly; param table in exit report).
  R-005 respected: route's layer-1 dedup keys on (source, event_id=payment.id, event_type), the
  SAME key confirm_order guards on internally — no divergent second path.
- Three-layer idempotency (§8): (1) processed_webhooks pre-check → 200 already_processed,
  (2) confirm_order IF EXISTS + status='pending_payment' guard, (3) UNIQUE(source,event_id,
  event_type). Replay flips state AT MOST once.
- Tests: webhook.test.js — 8 (wrong sig→400/no-call; missing header→400; TAMPERED-after-signing
  →400 proving verify is over raw bytes; valid captured→confirm_order once w/ exact params;
  replay→already_processed/no 2nd call; amount mismatch→not confirmed; orphan→200 no-op;
  payment.failed→200 ignored). Signatures are REAL in-test HMACs — verifier never mocked. 89
  green (+8). Test detour: supertest re-serializes a Buffer body under JSON content-type and
  corrupts signed bytes → send JSON as a STRING (superagent leaves strings untouched).
- Verified LIVE against real DB (order 97b3c311…): happy path flipped pending_payment→placed,
  stored razorpay_payment_id (pay_test_s9_001), wrote payment_confirmed event + order.placed
  outbox row + processed_webhooks row; replay→already_processed (no 2nd change); bad sig→
  INVALID_SIGNATURE (no DB change); amount mismatch→amount_mismatch (unchanged).
- DEBT logged: T-014 (RECONCILE CRON — BEFORE LAUNCH: lost/orphan/amount-mismatch webhooks are
  only logged, no sweep → a lost webhook leaves an order stuck in pending_payment forever).
  T-015 (OUTBOX DRAIN — BEFORE LAUNCH: confirm_order writes the order.placed outbox row but
  NOTHING drains it yet → no pg-boss workers, so KOT/notify/dispatch never fire; a placed order
  is currently INERT — the kitchen never hears about it).
- Concerns ahead: the next big arc is the outbox drain + side-effect workers (pg-boss → PetPooja
  KOT, notifications, Shadowfax dispatch) — that's where a placed order actually reaches the
  restaurant. T-011 (order-creation race) still stands. No frontend Razorpay modal yet (checkout
  still shows "payment coming soon"; wiring the real modal is its own concern).
- PARKED: none.

### Session 10 — pg-boss queue + outbox drain + stub workers  ·  MERGED 2026-06-16
- INFRASTRUCTURE, not money-path. apps/api only. Makes a placed order stop being inert: the
  order.placed outbox rows confirm_order writes (S9) now MOVE through a drain → pg-boss queues.
  Workers are STUBS (write '<queue>.stub_executed' order_events) — real bodies land S12/S13/S17.
- PREREQUISITE (manual): DATABASE_URL set to Supabase DIRECT 5432 (NOT pooled 6543); IPv6 enabled
  so pg-boss connected. config.js now REQUIRES DATABASE_URL and REFUSES any ':6543' URL with an
  explicit "use the direct 5432" message (the #1 failure mode, guarded + verified firing).
- pg-boss v12.19.1 — Claude verified the installed API against §9's older example and ADAPTED:
  (a) retry policy is QUEUE-level via createQueue({retryLimit,retryBackoff}), NOT a work() option;
  (b) queues created explicitly before work()/send(); (c) work handlers receive a BATCH array.
  This is the "verify against installed version, don't copy stale snippet" discipline working.
- queue/ files: boss.js (PgBoss singleton on config.DATABASE_URL, error→pino; construct does NOT
  connect — connects at boss.start(), so tests/readyz can require it cheaply); workers.js
  (startWorkers + isBossStarted; 4 queues pos.pushKot 5×backoff / delivery.dispatch 3×backoff /
  notify.statusChanged 3 / loyalty.award 3); jobs/*.js (4 stubs); outboxDrain.js (drainOnce(deps)
  INJECTABLE core + start()/stop(); 2s overlap-guarded unref'd interval; select unprocessed
  oldest-first limit 50; per-row try/catch; order.placed → pushKot+notify always, +dispatch when
  order_type='delivery'; processed_at set ONLY after sends succeed); dlq.js getFailedCounts()
  (v12 has NO failed-count API → SQL on pgboss.job WHERE state='failed'; documented in-file).
- server.js: after listen → startWorkers + outboxDrain.start; SIGINT/SIGTERM → stop drain +
  boss.stop({graceful:true}). /readyz enriched: {boss_started, outbox_unprocessed}, 503 if boss down.
- HARDENING (manual-test finding, fixed same branch): manual test surfaced 2 orphan outbox rows
  (S9 test detritus — order.placed rows whose orders never existed, created 2026-06-13) that the
  drain retried FOREVER every 2s (.single() → "Cannot coerce result to single JSON object"). Two
  fixes: (1) DATA — deleted the 2 orphan rows; (2) CODE — drain now distinguishes PERMANENT from
  TRANSIENT: order-not-found (.single→.maybeSingle, data:null) is permanent → mark processed +
  warn + NO fan-out (stop retrying); transient errors (DB/network, failed send, failed update)
  still throw → leave unprocessed for retry (at-least-once PRESERVED). New not-found test added.
- HOTFIX (CI red on main, fixed via s10-hotfix-readyz-ci branch): S10 was pushed to main before
  branch-CI confirmed green → CI api(vitest) went red. ONE test ("GET /readyz returns 503 when
  pg-boss has not started") TIMED OUT 5000ms in CI but passed locally — the standing local≠CI
  risk biting again (cf S2A Node 20). Cause: /readyz did an unconditional DB round-trip
  (customers select) before the boss check; in CI the placeholder unreachable localhost DB hung
  the await past the test timeout. Fix (app.js): (1) boss-not-started SHORT-CIRCUITS to 503
  BEFORE any DB call (hermetic + prod-correct: down queue = placed order goes nowhere); (2) both
  /readyz DB queries carry AbortSignal.timeout(2000) so DB-down also 503s fast. Net: boss down→503
  fast, DB down→503 fast(≤2s), both up→200. PROVEN under simulated-CI unreachable-DB condition
  (13ms, was 5000ms timeout) before pushing — the verification step that was missing the first time.
- Tests: 96 (was 89: +5 drain unit, +1 readyz-503, +1 not-found). Mutation-checked: forcing
  delivery.dispatch for all order_types fails the dine_in fan-out test; forcing a missing-order
  row to fan out fails the not-found test. Both guards genuinely covered.
- VERIFIED LIVE (clean slate, order 57cc372e-…, total 499): fresh delivery order → signed webhook
  → placed → drain fanned out → order_events showed payment_confirmed + all 3 stub events; restart
  → NO duplicate executions/events (processed_at honored — the property that, broken, double-fires
  KOTs); /readyz {db:ok, boss_started:true, outbox_unprocessed:0}.
- T-015 UPDATED: outbox drain now WIRED (was "not built"), but workers are stubs → placed orders
  still don't reach the real kitchen until S12/S13. T-014 (reconcile) UNCHANGED — still before-launch.
- NEW S12/S13 OBLIGATION (logged as T-016): the drain is AT-LEAST-ONCE — a row can be re-sent if
  mark-processed fails after a successful send. With stubs that's a harmless duplicate event; once
  S12/S13 put REAL PetPooja/Shadowfax calls behind these queues, a re-send = duplicate KOT /
  duplicate rider unless those external calls are IDEMPOTENT. S12/S13 MUST make them idempotent.
- PROCESS LESSON (banked): branch-CI-green is the merge gate. Push branch → watch branch CI green
  → THEN squash to main. Matters MOST on sessions touching CI config / boot / lifecycle code. S10
  skipped it and main went red; the hotfix also collapsed the branch-watch (merged then confirmed
  main green) — outcome fine, habit still forming. The two-minute CI wait is cheap insurance.
- Concerns for S11: first session to OPEN RLS (read policies for customer-owned rows) — touches
  security posture; brings the frontend back (Realtime tracking UI + polling fallback). The anon
  key starts being able to read specific rows — the deny-all wall opens a crack, deliberately.
- PARKED: none (hardening + hotfix folded into the session, not deferred).

### Session 11 — Order Tracking: RLS read policies + Realtime UI + polling fallback  ·  MERGED 2026-06-16
- FIRST session to OPEN RLS read access (the deny-all wall from 004 gets its first deliberate
  crack) AND first to bring the FRONTEND back since S8. Security-posture session — reviewed the
  policy USING clauses line-by-line + proved them with the anon-key probe (the non-negotiable gate).
- Migration 007_rls_policies.sql — POLICIES ONLY (RLS already enabled in 004; V2 patch O1). NOT
  006 (taken by place_order, S7). Five SELECT policies, idempotent (DROP IF EXISTS + CREATE):
  menu_categories/menu_items → TO anon,authenticated USING(true) (public menu); orders → TO
  authenticated USING(customer_id=auth.uid()); order_items/order_events → TO authenticated USING
  EXISTS-join to an owned order. NO write policies (service_role bypasses RLS, backend
  unaffected); NO anon access beyond the two menu tables.
- Frontend (3 files): lib/realtime.ts subscribeToOrder (channel order-<id>, postgres_changes
  UPDATE filter id=eq.<id>; SUBSCRIBED→onRestored, CHANNEL_ERROR/TIMED_OUT/CLOSED→onDegraded;
  uses existing anon-key browser client). components/StatusStepper.tsx (delivery [placed,
  confirmed,preparing,ready,dispatched=Out for delivery,delivered]; dine_in [...,served]; matches
  §6 enum; TERMINALS map for cancelled/rejected/payment_failed/expired). app/track/[orderId]/
  page.tsx (Next 16 client page, params via React use(); reads order via RLS browser client —
  see D-008; degraded→15s poll re-select, restored→stop; "Live"/"Refreshing periodically" pill;
  logged-out→Google sign-in; not-found==not-yours→one "order not found" screen).
- KEY DEVIATION (→ D-008): the prompt wrongly said GET /api/orders/:id "exists from S7" — it
  doesn't (S7 built only POST). Claude Code CAUGHT it and asked; ruled RLS-read (no backend
  route). This is the locked pattern: reads via RLS, writes via API.
- AUTH SCARE RESOLVED: mid-session Pranav flagged a custom localStorage.token (id/iat/exp only,
  not Supabase Auth) → would break auth.uid() RLS. Investigated: the localStorage.token is the
  SAME INERT S7-era leftover (test1/id:35), authenticates nothing. The REAL session is the
  Supabase cookie sb-<ref>-auth-token (S6 Google OAuth via @supabase/ssr), which the browser
  client reads automatically → auth.uid() resolves. Proven: anon probe→0 rows; real cookie
  token→exactly the 3 own orders (be0ee15c/57cc372e/97b3c311). RLS strategy SOUND.
- VERIFIED LIVE (all gates): anon key → orders/order_items/order_events all []; menu_items →
  rows (PowerShell note: use -UseBasicParsing / Invoke-RestMethod, legacy IE parser can show
  false []). Real token → own 3 orders only. SQL transition_order placed→confirmed→preparing→
  ready → stepper advanced LIVE in browser within ~2s, pill "Live" (Realtime publication on
  orders confirmed working). Offline→"Refreshing periodically"→restore→"Live". Incognito→sign-in
  screen (not "not found"). State machine also confirmed enforcing at DB level (confirmed→
  confirmed rejected with the §7 error).
- No backend route change; API untouched → 96 api tests stand. web build/lint/tsc green.
- DEBT: T-004 RESOLVED (RLS read policies now exist). T-017 added (delete the dead localStorage.
  token/user keys — inert leftover that has now caused an auth-investigation detour TWICE, S7
  and S11; it impersonates real auth and misleads debugging).
- NOTE: Claude Code wrote a memory file to C:\Users\PRANAV\.claude\projects\...\memory\ — that's
  a CC-local store, NOT our MASTER/CLAUDE.md. The decision it captured is now properly recorded
  here as D-008. Don't treat the CC-local file as source of truth (won't travel with the repo).
- Concerns for S11A (next, V2 patch inserts it here): Playwright critical-path E2E — menu→cart→
  checkout→simulated webhook→tracking reaches placed/confirmed, headless in CI. Needs a seeded
  test user + a way to drive the webhook in-test. First E2E; guards S5/S8/S11 shared surfaces.
- PARKED: none.

### Session 11A — Playwright critical-path E2E + webhook simulator  ·  MERGED 2026-06-17
- FIRST end-to-end test. One automated proof of the money path, headless + in CI on every push:
  menu → cart → checkout → simulated payment.captured → /track reaches Placed. Guards the
  S5/S8/S11 shared surfaces forever. NOT a money-logic session — test infra around verified logic.
- DEPS (approved): @playwright/test, wait-on (apps/web, chromium only). No app/route/RLS/money
  change anywhere.
- Files: apps/api/scripts/ — simulate-razorpay-webhook.js (the REUSABLE simulator power-tool;
  looks up order, builds payment.captured, HMAC-signs the EXACT string it POSTs — S9 lesson;
  paise only at the edge), seed-test-user.js (admin create-or-update test_e2e@yumyumtree.local +
  customers row), cleanup-e2e.js (deletes test user's orders/items/events/outbox + pay_test_*
  webhooks). ALL THREE call assertSafeTestDb() first (prod-fence). apps/web/e2e/ — auth.ts
  (signs in via @supabase/ssr server client, captures the library's OWN cookie shape, injects into
  Playwright context → app loads authed, no OAuth UI — clever: same lib writes+reads, no
  hand-rolled cookie to drift), checkout.spec.ts (real flow, stubs window.Razorpay, intercepts
  POST /api/orders for order_id, shells out to the simulator, polls /track for Placed),
  cart-gate.spec.ts, global-setup/teardown, playwright.config.ts. CI: new `e2e` job boots api+web,
  wait-on, chromium --with-deps, artifacts on failure.
- THREE naive-spec corrections (the prompt/roadmap was wrong; Claude caught all three):
  (1) no webhook simulator existed (S9 used hand-crafted curl) → BUILT it this session; (2) no
  /login redirect exists (gate is client-side, T-013) → cart-gate asserts the SIGN-IN GATE
  appears, not a redirect; (3) /checkout shows "payment coming soon" and never constructs
  window.Razorpay → stub is defensive-only, NOT asserted called.
- VERIFIED LOCAL (real Supabase): 5× green (3 consecutive + shakeout + headed). Headed run drove
  the full flow visually. ANTI-FALSE-GREEN proven: api killed → checkout.spec FAILS loudly (menu
  cards never render against dead /api/menu), cart-gate still passes (specific, not blanket) —
  Claude even caught its OWN false-green (pkill -f doesn't reach Windows node; api stayed up;
  re-killed via port listener). Cleanup verified: post-run orders=[]/webhooks=[].
- CI FIGHT (the real work — branch-CI gate contained ALL of it; main never went red):
  (a) e2e red — wait-on timeout, both ports down. Part 1 added a dump_diag (logs+listeners on
  failure) so the boot error became legible. (b) Dump showed `connect ENETUNREACH 2406:da1a:...
  :5432` — pg-boss's direct host is IPv6-only, GitHub runners are IPv4-only → api process.exit(1)
  on boot. (c) FIX = D-009: session-pooler DATABASE_URL (IPv4, session-mode, :5432) in the GitHub
  secret. api then booted (pg-boss connected). (d) Next red — `EADDRINUSE :::4000`: job-level
  PORT=4000 (for api) was inherited by `next dev`, which binds PORT → web collided on 4000. Fix:
  `npm run dev -- -p 3000` (CLI -p beats env PORT). (e) GREEN on main 9316c61, all 3 jobs incl e2e.
- D-009 logged (session pooler everywhere). The mobile-hotspot workaround RETIRED: local
  apps/api/.env also switched to the pooler → ethernet works for every session (verified: api
  boots clean on ethernet, pg-boss connected, no ENETUNREACH). CLAUDE.md LOCAL ENV block rewritten.
- SECURITY ITEM → T-018: the Supabase service_role key was printed in plaintext in an ad-hoc
  shell command during verification (visible in chat scrollback). Per §29 (rotate on exposure):
  ROTATE the service_role key (Supabase → Settings → API), update apps/api/.env + the GitHub
  SUPABASE_SERVICE_ROLE_KEY secret. Dev-only, private repo → low risk, but rotate-first is the rule.
- GIT HISTORY WART (content correct, shape messy — deliberately NOT fixed): the S11A merge got
  tangled (aborted cherry-pick → reset main to branch tip → squash carried only memory files).
  Net: main has ALL S11A files + the pooler memory update, no commits lost (reflog-confirmed), but
  S11A is 4 commits not 1 squash, and commit 9316c61's message says "S11A feature" while its diff
  is only the memory files (real test files are in 41b37ae). Left as-is: rewriting freshly-pushed
  public history right after 3 git mishaps is higher-risk than a cosmetic-only wart. LESSON: do
  memory-file commits on a CLEAN tree / dedicated step — uncommitted memory edits caused the
  checkout-abort cascade.
- NOTE: api integration tests that previously SKIPPED in CI (CI_HAS_DEV_DB gate) now RUN there
  (dev secrets added for the e2e job) — more real CI coverage as a side benefit.
- Concerns for S12 (next): real PetPooja KOT. Needs staging credentials (only remaining PetPooja
  blocker — callback confirmed, docs in hand). T-016 applies: the /saveorder call MUST be
  idempotent (drain is at-least-once; clientOrderID is the idempotency key). Maps PetPooja status
  codes → §7 (1/2/3 all = accepted; needs a translation layer). The S11A E2E guards the money path
  while S12 swaps the pushKot stub for the real call.
- PARKED: next build && next start CI determinism switch (would also need -p 3000 / PORT handling
  for next start) — noted, deferred. order_events timeline UI (S20). Razorpay modal.

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
T-004 · ~~RESOLVED (S11)~~ · RLS read policies absent (deny-all only) · all tables · resolved by
  migration 007_rls_policies.sql: menu public-readable; orders/order_items/order_events readable
  only by the owning authenticated customer. Verified via anon-key probe (0 rows) + real-token
  probe (own orders only).
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
T-009 · ~~RESOLVED (S8A)~~ · GET /api/menu exposes category_ref (petpooja_id text) · apps/api/src/routes/menu.js ·
  S21's DB-backed version uses category_id (uuid FK); contract key could shift · repay at S21:
  keep category_ref stable or version the §12 payload so the frontend grouping doesn't break.
T-010 · Logo is a 239×240 low-res screenshot · apps/web/public/logo.png · fine at header size
  but not for larger use / retina · repay: get original high-res (SVG ideal) from owner, drop
  in as logo.png — nothing else changes.
T-011 · Order-creation idempotency race · apps/api/src/routes/orders.js · concurrent same-key
  submits can each create a Razorpay order before place_order collapses to one DB order (one
  orphaned UNPAID Razorpay order; DB never double-orders; reconcile §30 sweeps). Accepted S7
  (mock orphan is free) · repay: at real-Razorpay session, create the Razorpay order AFTER the
  DB insert (insert pending_payment → create rzp order → update row) so a race makes zero orphans.
T-012 · Delivery address uses placeholder lat-lng (Hyderabad center 17.385/78.4867) ·
  apps/web/src/app/checkout/page.tsx · customer can't enter coords; the injected fixed point is
  fine for order creation but WRONG for distance · repay: real geocoding / map picker BEFORE
  delivery-radius enforcement or Shadowfax dispatch (those need the true drop point).
T-013 · Checkout login gate is client-side only · apps/web/src/app/checkout/page.tsx · the gate
  is UX, not security (server still enforces auth via Bearer + prices server-side), but server
  components can't read auth reliably without @supabase/ssr middleware · repay: add the middleware
  when a real server-side wall / protected route is needed (deferred since S6).
T-014 · ⚠️ BEFORE LAUNCH · Reconcile cron not built · webhook (routes/payments.js) only LOGS
  orphan / amount-mismatch / and cannot catch a LOST webhook · a captured payment whose webhook
  never arrives leaves the order stuck in pending_payment forever (customer charged, no order
  progresses) · repay: build the §30 reconcile sweep (poll Razorpay for recent captures, find
  any without a placed order, flag for manual review) as its own session BEFORE go-live.
T-015 · ⚠️ BEFORE LAUNCH · Outbox drain WIRED (S10) but workers are STUBS · apps/api/src/queue ·
  the drain now fans order.placed → pg-boss queues, but the job bodies only write
  '<queue>.stub_executed' events — no real KOT (PetPooja) / dispatch (Shadowfax) / notify /
  loyalty · a placed order still does not reach the real kitchen · repay: S12 (PetPooja KOT) +
  S13 (Shadowfax dispatch) + S17 (loyalty) swap real bodies into the existing stubs.
T-016 · ⚠️ S12/S13 CORRECTNESS · Outbox drain is AT-LEAST-ONCE · apps/api/src/queue/outboxDrain.js
  · a row can be re-sent if mark-processed fails after a successful boss.send (or on restart mid-
  batch). With S10 stubs this is a harmless duplicate order_event; once S12/S13 put REAL external
  calls behind pos.pushKot / delivery.dispatch, a re-send = DUPLICATE KOT / DUPLICATE rider unless
  the calls are idempotent · repay: S12/S13 MUST make PetPooja/Shadowfax calls idempotent (e.g.
  idempotency key / check-before-send / dedupe on an external ref) — do not assume exactly-once.
T-017 · Dead localStorage.token/user keys (old experiment: token, user with test1/id:35) ·
  apps/web (wherever they were once written; likely no longer written, just stale in browsers) ·
  INERT — not read by the Supabase client, not sent on RLS reads, authenticates nothing. BUT it
  impersonates real auth and has caused an auth-investigation detour TWICE (S7, S11) · repay:
  find and delete any code that writes localStorage 'token'/'user'; optionally clear them on load.
  Low effort, removes a recurring debugging tripwire.
T-018 · ~~RESOLVED (2026-06-17)~~ · SECURITY · Supabase secret key (sb_secret_, the new-system
  key in apps/api/.env as SUPABASE_SERVICE_ROLE_KEY) was exposed in chat scrollback during S11A
  verification · RESOLVED: created a new sb_secret_ key → updated apps/api/.env + GitHub
  SUPABASE_SERVICE_ROLE_KEY → verified api boots clean on the new key (pg-boss connected) →
  DELETED the old exposed key (so the scrollback value is now dead). NOTE: the exposed key was the
  NEW-system sb_secret_, NOT the legacy service_role JWT (separate, unused, untouched). Verify the
  next CI e2e run is green (confirms GitHub got the new key).
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
- PetPooja · creds held: NO (still pending — integration-fee/approval gates the real keys) ·
  mode: mock · last contact: 2026-06-16 reply — CALLBACK CONFIRMED (push via callback_url in
  /saveorder; we implement /callback). API docs v2.1.0 received (saved: PetPooja_API_Docs_v2.1.0.
  pdf). C-03 RESOLVED. · next chase: credentials/staging keys (needed for S12 live test) · note:
  /saveorder returns PetPooja orderID + clientOrderID; clientOrderID = our idempotency key (T-016).
  Status codes need a translation layer onto §7 (1/2/3 all = accepted). Servers: staging =
  developerapi.petpooja.com; key endpoints /saveorder, /callback (ours), /orderstatus (cancel),
  /fetchmenu, /item_stock. Auth headers: app-key[32]/app-secret[40]/access-token[40].
- Shadowfax · creds: NO · mode: mock · onboarding: not started · next chase: when Phase E nears.
- Meta WhatsApp · creds: NO · Business Manager: not created · next: before S23.
- Razorpay · test mode: available on demand · live: KYC not started (S15A) · note: live
  activation needs legal pages (S15A) — start KYC there to run review in parallel.
- Domain (yumyumtree.in) · owned: NO · required before S16 (QR print lock, finding O3).

---

## 12. DEPLOYMENT HISTORY  (append-only: date · sha · sessions · migrations · smoke · rollbacks)
- 2026-06-14 · DEV DB (no prod yet) · S7 · ran migration 006_place_order.sql in Supabase SQL
  editor + executed scripts/seedMenu.js (9 categories, 88 items loaded into menu_categories/
  menu_items). Verified: live order created end-to-end. No prod deploy (prod env = S14A).
- 2026-06-15 · DEV (no prod yet) · S8 · no schema/migration change. GET /api/menu now reads the
  DB (data already seeded in S7). Live end-to-end checkout verified (order 97b3c311). No prod
  deploy (prod env = S14A).
- 2026-06-15 · DEV (no prod yet) · S9 · no schema/migration change (confirm_order already in mig
  005). Payment webhook live; confirm_order called for the first time. Verified live: order
  97b3c311 pending_payment→placed via signed webhook. Razorpay test keys + webhook secret in
  local .env only. No prod deploy (prod env = S14A).
- 2026-06-16 · DEV (no prod yet) · S10 (+ hardening + s10-hotfix-readyz-ci) · no SQL migration,
  but pg-boss created its own `pgboss` schema in the DEV Supabase DB on first boss.start() (DDL
  via the direct 5432 connection). Verified live: order 57cc372e fanned out to 3 stub queues;
  restart-idempotent. CI went RED on first push (a5101d4, /readyz hung in CI on placeholder DB),
  fixed forward by adde37a (boss short-circuit + 2s DB abort) — main green. No prod deploy (S14A).
  ROLLBACK: none needed; forward-fix only. NOTE: pgboss schema will be re-created on PROD's first
  boot at S14A (DDL on a fresh direct-5432 prod connection).
- 2026-06-16 · DEV (no prod yet) · S11 (cea27c8) · ran migration 007_rls_policies.sql in the
  Supabase SQL editor (5 SELECT policies; RLS already enabled in 004). Enabled Realtime
  publication on `orders` (dashboard) so live UPDATEs stream. Verified live: anon→0 order rows,
  real token→own orders, SQL transition→stepper advances live, offline→poll→restore. CI green.
  No prod deploy (S14A). ROLLBACK: policies are additive over deny-all; dropping them reverts to
  deny-all (safe).
- 2026-06-17 · DEV (no prod yet) · S11A (main tip 9316c61) · no SQL migration; test infra only
  (Playwright E2E + simulator/seed/cleanup scripts + CI e2e job). CONFIG CHANGES (not code):
  GitHub DATABASE_URL secret + local apps/api/.env switched to the SESSION POOLER (D-009); dev
  Supabase secrets + RAZORPAY_WEBHOOK_SECRET added to GitHub for the e2e job; email/password
  provider enabled in dev Supabase. CI now has 3 jobs (api, web, e2e) — all green on main. Messy
  merge (see S11A history block) but content correct, no commits lost. ROLLBACK: n/a (additive
  test infra). FOLLOW-UP: T-018 (rotate exposed service_role key).
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