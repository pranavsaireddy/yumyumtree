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

// Readiness probe: a real DB round-trip PLUS the queue's liveness. Any DB failure (query error
// or thrown/network error) or a not-yet-started pg-boss is a 503 — never a 500 — so uptime
// monitors read it correctly. outbox_unprocessed surfaces a backed-up drain at a glance.
app.get('/readyz', async (req, res) => {
  const bossStarted = workers.isBossStarted();
  let dbOk = true;
  let outboxUnprocessed = null;

  try {
    const { error } = await supabase.from('customers').select('id').limit(1);
    if (error) dbOk = false;

    const { count, error: outboxErr } = await supabase
      .from('outbox')
      .select('id', { count: 'exact', head: true })
      .is('processed_at', null);
    if (outboxErr) dbOk = false;
    else outboxUnprocessed = count;
  } catch (_err) {
    dbOk = false;
  }

  const ready = dbOk && bossStarted;
  return res.status(ready ? 200 : 503).json({
    db: dbOk ? 'ok' : 'down',
    boss_started: bossStarted,
    outbox_unprocessed: outboxUnprocessed,
    app_env: config.APP_ENV,
  });
});

app.use(errorHandler);

module.exports = app;
