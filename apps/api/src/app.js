'use strict';

const express = require('express');
const cors = require('cors');

const config = require('./config');
const supabase = require('./lib/supabase');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.FRONTEND_URL }));

// ──────────────────────────────────────────────────────────────────────────────
// WEBHOOK ROUTES MOUNT HERE WITH express.raw BEFORE express.json — architecture §8
// HMAC signature verification needs the unparsed raw body, so each webhook route must
// mount express.raw({ type: 'application/json' }) and sit BEFORE the global json parser
// below. Routers are added in their own sessions; placeholders kept here intentionally:
//
// app.use('/payments/webhook', express.raw({ type: 'application/json' }), require('./routes/payments'));
// app.use('/delivery/webhook', express.raw({ type: 'application/json' }), require('./routes/delivery'));
// ──────────────────────────────────────────────────────────────────────────────

app.use(express.json());

// Non-webhook API routes mount AFTER express.json. /api/menu is public (no auth) — §12.
app.use('/api/menu', require('./routes/menu'));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', project: 'YumYumTree API' });
});

// Readiness probe: a real DB round-trip. Any failure (query error or thrown/network
// error) is a 503 { db: 'down' } — never a 500 — so uptime monitors read it correctly.
app.get('/readyz', async (req, res) => {
  try {
    const { error } = await supabase.from('customers').select('id').limit(1);
    if (error) return res.status(503).json({ db: 'down' });
    return res.status(200).json({ db: 'ok', app_env: config.APP_ENV });
  } catch (_err) {
    return res.status(503).json({ db: 'down' });
  }
});

app.use(errorHandler);

module.exports = app;
