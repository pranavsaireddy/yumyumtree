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
D-007 · 2026-06-14 · Google sign-in only; login required at checkout (S8); NO guest checkout.
  Why: guest checkout conflicts with customers.id==auth uid (orders.customer_id FK, tracking,
  loyalty, RLS all assume an authed identity). Browse+cart already anonymous, so friction is
  low; accounts drive the repeat-business loyalty is built for. Phone OTP/email/guest = later.
  Revisit-if: owner wants guest checkout → its own session, design nullable customer_id or
  shadow-row model + tracking/loyalty/RLS adaptations first.
  Decided-by: human decision (Option A), Fable flagged the conflict + recommended it.

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
- Phase C (payments) in progress. S1–S8 all MERGED. Next: Session 9 — payment webhook
  (POST /payments/webhook: verify Razorpay HMAC on raw body, processed_webhooks dedupe,
  confirm_order RPC (already in mig 005) pending_payment→placed, outbox; + reconcile for
  lost-webhook/orphan). FIRST WEBHOOK + second money-path session — high review.
- main clean + pushed (4cdb2e0). CI green (both jobs). 81 api tests. Live + verified end-to-end:
  menu (DB-backed) + cart (persisted) + Google auth + order creation + DELIVERY CHECKOUT UI.
- Customer journey works: browse → cart → checkout → sign-in gate → order in pending_payment.
  Payment itself is stubbed (Razorpay mock; modal + webhook = S9).
- TEAM: SOLO build — Pranav owns backend AND frontend. No Anudeep.
- Prod env: none yet (S14A). CI repo secrets not added. RLS still deny-all (read policies S11).
- Blockers: PetPooja creds+callback (chase 2026-06-18) · Shadowfax (not started) · Meta (not
  started) · Razorpay TEST-MODE keys (NEEDED for S9 webhook signature testing) · domain (S16).
- Gate 0 COMPLETE. Debt T-006..T-013 (T-009 resolved). Risk R-005. D-007 no guest checkout.
- PROCESS: PowerShell git one line at a time. `git status` clean-tree check before each session.
  Supabase session in COOKIES not localStorage. On money path: verify the DB ROW, not just the UI.
  Branch BEFORE Claude Code. CI Node 22 = truth.

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
- 2026-06-14 · DEV DB (no prod yet) · S7 · ran migration 006_place_order.sql in Supabase SQL
  editor + executed scripts/seedMenu.js (9 categories, 88 items loaded into menu_categories/
  menu_items). Verified: live order created end-to-end. No prod deploy (prod env = S14A).
- 2026-06-15 · DEV (no prod yet) · S8 · no schema/migration change. GET /api/menu now reads the
  DB (data already seeded in S7). Live end-to-end checkout verified (order 97b3c311). No prod
  deploy (prod env = S14A).
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