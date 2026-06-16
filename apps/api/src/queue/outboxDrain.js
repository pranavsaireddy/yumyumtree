'use strict';

const boss = require('./boss');
const supabase = require('../lib/supabase');
const logger = require('../lib/logger');

// Outbox drain (architecture §10). Every 2s it picks up unprocessed outbox rows — written in
// the same DB transaction as the order state change by confirm_order — and fans each out to
// the pg-boss queues. This is the bridge that makes a 'placed' order actually DO something.
//
// At-least-once: a row is marked processed ONLY after its sends succeed. A crash or a failed
// send leaves the row unprocessed, so the next tick retries it. Downstream idempotency (and
// pg-boss's own dedupe) absorbs the resulting duplicate.

const DRAIN_INTERVAL_MS = 2000;
const BATCH_LIMIT = 50;

let timer = null;
let inFlight = false;

/**
 * drainOnce — process a single batch. The CORE logic, with deps INJECTED so it is unit-testable
 * without a live database or a real pg-boss. start() calls it with the module singletons.
 *
 * @param {{ boss: object, supabase: object, logger: object }} deps
 */
async function drainOnce({ boss, supabase, logger }) {
  const { data: rows, error } = await supabase
    .from('outbox')
    .select('*')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    logger.error({ err: error }, 'outbox drain: select failed');
    return;
  }
  if (!rows || rows.length === 0) return;

  // PER-ROW try/catch: one poison row must not stall the rest of the batch. A throw anywhere
  // inside the block (order load, a send, or the mark-processed update) leaves THIS row's
  // processed_at null for the next tick to retry; the loop moves on to the next row.
  for (const row of rows) {
    try {
      if (row.event_type === 'order.placed') {
        const orderId = (row.payload && row.payload.orderId) || row.aggregate_id;

        // order_type decides whether a delivery dispatch applies — read it from the DB row.
        // maybeSingle() returns { data: null, error: null } for zero rows (single() would ERROR),
        // so "not found" is a clean data===null check, not error-string parsing.
        const { data: order, error: orderErr } = await supabase
          .from('orders')
          .select('id, order_type')
          .eq('id', orderId)
          .maybeSingle();

        // TRANSIENT: a real DB/network error → throw so the catch leaves the row for retry.
        if (orderErr) throw new Error(`load order ${orderId} failed: ${orderErr.message}`);

        // PERMANENT: the order does not exist. confirm_order writes order + outbox atomically,
        // so a missing order is a data anomaly that will NEVER appear — retrying forever just
        // spams errors. Mark processed and skip fan-out (no order = no KOT/notify/dispatch).
        if (!order) {
          logger.warn(
            { outboxId: row.id, orderId },
            'outbox drain: order not found, marking row processed — data anomaly'
          );
        } else {
          // Fan-out. pushKot + notify always; dispatch only for delivery orders.
          await boss.send('pos.pushKot', { orderId });
          await boss.send('notify.statusChanged', { orderId, status: 'placed' });
          if (order.order_type === 'delivery') {
            await boss.send('delivery.dispatch', { orderId });
          }
        }
      } else {
        // Unknown event types are still marked processed (logged once) so they don't loop.
        logger.warn({ eventType: row.event_type, outboxId: row.id }, 'outbox drain: unknown event type');
      }

      const { error: updateErr } = await supabase
        .from('outbox')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateErr) throw new Error(`mark processed failed: ${updateErr.message}`);
    } catch (err) {
      // Do NOT mark processed — leave the row for the next tick to retry.
      logger.error({ err, outboxId: row.id }, 'outbox drain: row failed, left unprocessed for retry');
    }
  }
}

function start() {
  if (timer) return;
  timer = setInterval(async () => {
    // Overlap guard: a slow batch must not have a second tick running concurrently.
    if (inFlight) return;
    inFlight = true;
    try {
      await drainOnce({ boss, supabase, logger });
    } catch (err) {
      logger.error({ err }, 'outbox drain: tick failed');
    } finally {
      inFlight = false;
    }
  }, DRAIN_INTERVAL_MS);
  // Don't let the interval keep the process alive during graceful shutdown.
  if (typeof timer.unref === 'function') timer.unref();
  logger.info('outbox drain started');
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop, drainOnce, DRAIN_INTERVAL_MS };
