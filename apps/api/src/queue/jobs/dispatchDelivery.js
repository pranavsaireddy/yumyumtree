'use strict';

const logger = require('../../lib/logger');
const supabase = require('../../lib/supabase');

const QUEUE = 'delivery.dispatch';

// S10 STUB — no real Shadowfax call. Real rider dispatch (with the manual fallback) is S13.
// For now the worker only records that it fired so the wiring is observable via order_events.
module.exports = async function dispatchDelivery({ orderId, ...data }) {
  logger.info({ orderId }, QUEUE);

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event: `${QUEUE}.stub_executed`,
    actor: 'system',
    payload: data,
  });

  if (error) throw new Error(`${QUEUE}: order_events insert failed: ${error.message}`);
};
