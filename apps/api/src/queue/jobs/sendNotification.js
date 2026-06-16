'use strict';

const logger = require('../../lib/logger');
const supabase = require('../../lib/supabase');

const QUEUE = 'notify.statusChanged';

// v1 cut — register entry #1 (no proactive web/QR notifications in v1; tracking link is the
// contract). Real body deferred. The worker stays registered so the outbox fan-out has a
// sink and the wiring is observable, but it performs no real notification.
module.exports = async function sendNotification({ orderId, ...data }) {
  logger.info({ orderId }, QUEUE);

  const { error } = await supabase.from('order_events').insert({
    order_id: orderId,
    event: `${QUEUE}.stub_executed`,
    actor: 'system',
    payload: data,
  });

  if (error) throw new Error(`${QUEUE}: order_events insert failed: ${error.message}`);
};
