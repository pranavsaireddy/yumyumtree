'use strict';

const express = require('express');
const cors = require('cors');

const config = require('./config');
const supabase = require('./lib/supabase');
const workers = require('./queue/workers');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.FRONTEND_URL }));

// ──────────────────────────────────────────────────────────────────────────────
// WEBHOOK ROUTES MOUNT HERE WITH express.raw BEFORE express.json — architecture §8
// HMAC signature verification needs the unparsed raw body, so each webhook route must
// mount express.raw({ type: 'application/json' }) and sit BEFORE the global json parser
// below. Routers are added in their own sessions; placeholders kept here intentionally:
//
// Razorpay payment webhook (S9): express.raw so the HMAC verify sees the exact signed bytes.
app.use('/payments/webhook', express.raw({ type: 'application/json' }), require('./routes/payments'));
// app.use('/delivery/webhook', express.raw({ type: 'application/json' }), require('./routes/delivery'));
// ──────────────────────────────────────────────────────────────────────────────

app.use(express.json());

// Non-webhook API routes mount AFTER express.json. /api/menu is public (no auth) — §12.
app.use('/api/menu', require('./routes/menu'));
// POST /api/auth/sync — upserts the customers row after a verified Supabase login (S6, D-004).
app.use('/api/auth', require('./routes/auth'));
// POST /api/orders — create a pending_payment order (auth required, server-side pricing, S7).
app.use('/api/orders', require('./routes/orders'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'YumYumTree API' });
});

// Readiness probe: the queue's liveness PLUS a real DB round-trip. Any of — a not-yet-started
// pg-boss, a DB query error, or a DB network/timeout failure — is a 503 (never a 500) so uptime
// monitors read it correctly. A probe must be FAST: the boss check short-circuits before the DB
// round-trip (boss down → 503 with no wasted/hanging DB call), and the DB calls carry an abort
// timeout so an unreachable DB fails fast instead of hanging the probe. outbox_unprocessed
// surfaces a backed-up drain at a glance.
const READYZ_DB_TIMEOUT_MS = 2000;

app.get('/readyz', async (req, res) => {
  const bossStarted = workers.isBossStarted();

  // Short-circuit: a down queue alone is a 503 — a placed order would go nowhere — so there is
  // no reason to touch the DB. This also keeps the probe (and its test) independent of DB
  // reachability when the queue is the failing signal.
  if (!bossStarted) {
    return res.status(503).json({
      db: null,
      boss_started: false,
      outbox_unprocessed: null,
      app_env: config.APP_ENV,
    });
  }

  let dbOk = true;
  let outboxUnprocessed = null;

  try {
    const { error } = await supabase
      .from('customers')
      .select('id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(READYZ_DB_TIMEOUT_MS));
    if (error) dbOk = false;

    const { count, error: outboxErr } = await supabase
      .from('outbox')
      .select('id', { count: 'exact', head: true })
      .is('processed_at', null)
      .abortSignal(AbortSignal.timeout(READYZ_DB_TIMEOUT_MS));
    if (outboxErr) dbOk = false;
    else outboxUnprocessed = count;
  } catch (_err) {
    dbOk = false;
  }

  return res.status(dbOk ? 200 : 503).json({
    db: dbOk ? 'ok' : 'down',
    boss_started: true,
    outbox_unprocessed: outboxUnprocessed,
    app_env: config.APP_ENV,
  });
});

app.use(errorHandler);

module.exports = app;
