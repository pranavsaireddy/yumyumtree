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

---

## 5. CUTS REGISTER  (append-only, owner-signed; a cut without a signature is a forgotten feature)
C-01 · v1 CUT: proactive customer notifications (SMS/WhatsApp status alerts) for web/QR.
  v1 substitute: live tracking link; WhatsApp-channel orders get a confirmation in S24.
  Revisit: v1.1.   Owner sign-off: <initials / date — PENDING Gate 0 item 1>.
C-02 · v1 CUT: add-on machinery (menu_addons UI/pricing/sync) removed from the order path.
  v1 substitute: extras listed as standalone PetPooja menu items ("Extra Raita ₹30") that
  sync automatically. menu_addons table stays dormant.
  Revisit: v1.1.   Owner sign-off: <initials / date — PENDING Gate 0 item 2>.
C-03 · Kitchen progression model (preparing→ready driver): callback vs KDS-tablet.
  Status: UNDECIDED — depends on PetPooja's answer to the D2 callback question.
  To be filled before S21.   Owner sign-off: <pending PetPooja reply>.

---

## 6. CURRENT STATE  (the ONLY fully-rewritten section — ≤10 lines)
- Phase A (Foundation). Sessions executed: none. Next: Session 1 (DB schema + RPCs).
- main clean, both servers boot. Supabase DEV: customers, menu_categories, menu_items.
- CI: none yet (S2A). Prod env: none yet (S14A).
- Blockers: PetPooja creds (emailed) · Shadowfax (not started) · Meta (not started) ·
  Razorpay (test mode on demand).
- Gate 0: owner sign-offs PENDING; PetPooja callback question PENDING send.
- Nothing broken-but-known.

---

## 7. SESSION HISTORY  (append-only spine — includes failed sessions with their why)
(none yet — first entry will be Session 1's context-update block)

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

---

## 9. KNOWN TECHNICAL DEBT  (T-### · what · where · cost-of-ignoring · planned-repayment)
T-001 · Phone-OTP login UI ships disabled (no SMS provider funded) · apps/web /login ·
  customers limited to Google sign-in · repay: pre-launch provider decision.
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
- PetPooja · creds held: NO · mode: mock · last contact: API-access email sent +
  callback question <date> · next chase: +5 days · note: confirm callback support (C-03).
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
(none yet — first at the end of Phase A / Session 3)
