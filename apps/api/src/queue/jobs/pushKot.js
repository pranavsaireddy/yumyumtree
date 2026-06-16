'use strict';

const logger = require('../../lib/logger');
const supabase = require('../../lib/supabase');

const QUEUE = 'pos.pushKot';

// S10 STUB — no real PetPooja call. The real KOT push (with the PetPooja client + the
// kot_sent/kot_failed events) lands in S12. For now the worker only records that it fired,
// so the outbox → queue → worker wiring is observable end-to-end via order_events.
module.exports = async function pushKot({ orderId, ...data }) {
  logger.info({ orderId }, QUEUE);

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event: `${QUEUE}.stub_executed`,
    actor: 'system',
    payload: data,
  });

  // Throw on failure so pg-boss retries (and a stuck job lands in the DLQ) rather than
  // silently swallowing a lost side effect.
  if (error) throw new Error(`${QUEUE}: order_events insert failed: ${error.message}`);
};
