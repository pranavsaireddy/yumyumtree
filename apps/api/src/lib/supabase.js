'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Service-role client — BACKEND ONLY. Bypasses RLS; never expose this key to the browser
// (architecture §25). No session persistence: this is a stateless server process.
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = supabase;
