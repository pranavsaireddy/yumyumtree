# YumYumTree

Direct ordering platform (web, QR dine-in, WhatsApp) for one Hyderabad restaurant —
replacing aggregator commissions with a system the owner runs himself.

See `CLAUDE.md` and `docs/` for architecture and the session roadmap.

## CI

![CI](https://github.com/pranavsaireddy/yumyumtree/actions/workflows/ci.yml/badge.svg)

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and on pull requests to
`main`. The **api** job installs `apps/api` and runs the Vitest suite on Node 20.

The integration test (`GET /readyz`) needs the live DEV Supabase DB, so CI keys on the
`CI_HAS_DEV_DB` switch: when the repository secrets (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `PORT`, `FRONTEND_URL`) are present they are injected and the
DB test runs; when they are absent (e.g. fork PRs) the workflow injects non-secret
placeholders and the DB test is skipped — the pure `/health` test always runs. No secret
values live in the workflow, only `secrets.*` references.

The **web** job (`apps/web` lint + build) is parked in the workflow until the Next.js app
is scaffolded in a later session.
