'use strict';

const logger = require('../../lib/logger');
const supabase = require('../../lib/supabase');

const QUEUE = 'loyalty.award';

// S10 STUB — no real loyalty accounting. Real point-award (idempotent via the
// loyalty_transactions UNIQUE(order_id) row, run after delivered/served) is S17. Nothing
// enqueues this queue yet — the outbox fan-out only covers pushKot/notify/dispatch — but the
// worker is registered now so the queue exists ahead of S17.
module.exports = async function awardLoyalty({ orderId, ...data }) {
  logger.info({ orderId }, QUEUE);

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event: `${QUEUE}.stub_executed`,
    actor: 'system',
    payload: data,
  });

  if (error) throw new Error(`${QUEUE}: order_events insert failed: ${error.message}`);
};
