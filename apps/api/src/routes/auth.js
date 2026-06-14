'use strict';

const express = require('express');

const asyncHandler = require('../middleware/asyncHandler');
const supabase = require('../lib/supabase');

const router = express.Router();

// POST /api/auth/sync — SECURITY-CRITICAL.
//
// Called by the web auth callback right after a Google sign-in. Identity comes ONLY from the
// verified Supabase access token in the Authorization header — never from the request body.
// The body is ignored entirely (a spoofed `id`/`email` in it must have no effect).
//
// Flow:
//   1. Read the Bearer token; reject (401) when it's missing.
//   2. supabase.auth.getUser(token) validates the JWT against Supabase Auth and returns the
//      real user. A rejection or empty user → 401 (the token is invalid/expired).
//   3. Upsert customers (id = auth uid per D-004) with the email/name FROM THE TOKEN. The
//      service-role client bypasses deny-all RLS — the only writer allowed under S6's policy.
//
// Idempotent: re-running on every login is fine, so the callback never has to block the user.
router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';

    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHENTICATED' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    const user = data && data.user;
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHENTICATED' });
    }

    // Identity is derived ONLY from the verified user object. Name is best-effort from the
    // OAuth metadata Google supplies; null when absent.
    const meta = user.user_metadata || {};
    const name = meta.full_name || meta.name || null;

    const { error: upsertError } = await supabase
      .from('customers')
      .upsert({ id: user.id, email: user.email, name }, { onConflict: 'id' });

    if (upsertError) {
      const err = new Error('Failed to sync customer');
      err.status = 502;
      err.code = 'CUSTOMER_SYNC_FAILED';
      throw err;
    }

    // Deliberately do not echo the customer row — no PII beyond what the caller already holds.
    return res.status(200).json({ ok: true });
  })
);

module.exports = router;
