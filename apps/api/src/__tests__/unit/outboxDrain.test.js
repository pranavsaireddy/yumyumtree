'use strict';

// describe/it/expect/vi are globals (vitest.config.js → test.globals). Pure unit suite — the
// drain CORE (drainOnce) is exercised with INJECTED fakes for boss + supabase, so there is no
// database and no real pg-boss here.
const { drainOnce } = require('../../queue/outboxDrain');

// A silent logger so the suite output stays clean; the drain logs warns/errors on the sad paths.
const noopLogger = { info: () => {}, warn: () => {}, error: () => {} };

// ── Fake Supabase ──────────────────────────────────────────────────────────────
// Backs three query shapes the drain uses:
//   outbox SELECT  : .from('outbox').select('*').is('processed_at', null).order(...).limit(n)
//   orders SELECT  : .from('orders').select(...).eq('id', id).maybeSingle()
//   outbox UPDATE  : .from('outbox').update({ processed_at }).eq('id', id)
// The builder is thenable so `await chain` resolves to the right { data/count, error }.
function makeSupabase({ outbox, orders }) {
  function builder(table) {
    const state = { table, op: 'select', payload: null, eqId: undefined };
    const chain = {
      select() {
        return chain;
      },
      update(payload) {
        state.op = 'update';
        state.payload = payload;
        return chain;
      },
      is() {
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      eq(_col, val) {
        state.eqId = val;
        return chain;
      },
      maybeSingle() {
        // maybeSingle semantics: a missing row is { data: null, error: null } (NOT an error).
        const order = orders.find((o) => o.id === state.eqId);
        return Promise.resolve({ data: order || null, error: null });
      },
      then(resolve, reject) {
        let result;
        if (state.table === 'outbox' && state.op === 'select') {
          result = { data: outbox.filter((r) => r.processed_at == null), error: null };
        } else if (state.table === 'outbox' && state.op === 'update') {
          const row = outbox.find((r) => r.id === state.eqId);
          if (row) row.processed_at = state.payload.processed_at;
          result = { error: null };
        } else {
          result = { data: null, error: { message: `unhandled query on ${state.table}` } };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return chain;
  }
  return { from: (table) => builder(table) };
}

function deliveryRow(id = 'ob-d') {
  return { id, event_type: 'order.placed', aggregate_id: 'order-d', payload: { orderId: 'order-d' }, processed_at: null };
}
function dineInRow(id = 'ob-i') {
  return { id, event_type: 'order.placed', aggregate_id: 'order-i', payload: { orderId: 'order-i' }, processed_at: null };
}

const ORDERS = [
  { id: 'order-d', order_type: 'delivery' },
  { id: 'order-i', order_type: 'dine_in' },
  { id: 'order-a', order_type: 'delivery' },
  { id: 'order-b', order_type: 'dine_in' },
];

describe('outbox drain core (drainOnce)', () => {
  it('fans a delivery order out to 3 queues (pushKot + notify + dispatch)', async () => {
    const outbox = [deliveryRow()];
    const boss = { send: vi.fn(() => Promise.resolve()) };
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: noopLogger });

    const queues = boss.send.mock.calls.map((c) => c[0]);
    expect(boss.send).toHaveBeenCalledTimes(3);
    expect(queues).toEqual(['pos.pushKot', 'notify.statusChanged', 'delivery.dispatch']);
    expect(outbox[0].processed_at).not.toBeNull();
  });

  it('fans a dine_in order out to 2 queues (no delivery.dispatch)', async () => {
    const outbox = [dineInRow()];
    const boss = { send: vi.fn(() => Promise.resolve()) };
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: noopLogger });

    const queues = boss.send.mock.calls.map((c) => c[0]);
    expect(boss.send).toHaveBeenCalledTimes(2);
    expect(queues).toEqual(['pos.pushKot', 'notify.statusChanged']);
    expect(queues).not.toContain('delivery.dispatch');
    expect(outbox[0].processed_at).not.toBeNull();
  });

  it('isolates a failing row: a throw on row A still lets row B fan out and be marked processed', async () => {
    const rowA = { id: 'ob-a', event_type: 'order.placed', aggregate_id: 'order-a', payload: { orderId: 'order-a' }, processed_at: null };
    const rowB = { id: 'ob-b', event_type: 'order.placed', aggregate_id: 'order-b', payload: { orderId: 'order-b' }, processed_at: null };
    const outbox = [rowA, rowB];

    // Throw on row A's first send; row B's sends succeed.
    const boss = {
      send: vi.fn((queue, data) => {
        if (data.orderId === 'order-a') return Promise.reject(new Error('boom: pushKot down'));
        return Promise.resolve();
      }),
    };
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: noopLogger });

    // Row A left unprocessed for retry; row B fully processed.
    expect(rowA.processed_at).toBeNull();
    expect(rowB.processed_at).not.toBeNull();
    const bQueues = boss.send.mock.calls.filter((c) => c[1].orderId === 'order-b').map((c) => c[0]);
    expect(bQueues).toEqual(['pos.pushKot', 'notify.statusChanged']); // dine_in → 2
  });

  it('does not re-send an already-processed row (processed_at honored across ticks)', async () => {
    const outbox = [deliveryRow()];
    const boss = { send: vi.fn(() => Promise.resolve()) };
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: noopLogger }); // marks it processed
    expect(boss.send).toHaveBeenCalledTimes(3);

    boss.send.mockClear();
    await drainOnce({ boss, supabase, logger: noopLogger }); // select now filters it out
    expect(boss.send).not.toHaveBeenCalled();
  });

  it('marks an order-not-found row processed WITHOUT fanning out (permanent, not retried)', async () => {
    // The order referenced by the outbox row does not exist in the orders set (data anomaly).
    const outbox = [{ id: 'ob-missing', event_type: 'order.placed', aggregate_id: 'order-ghost', payload: { orderId: 'order-ghost' }, processed_at: null }];
    const boss = { send: vi.fn(() => Promise.resolve()) };
    const warn = vi.fn();
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: { ...noopLogger, warn } });

    expect(boss.send).not.toHaveBeenCalled(); // no order = no KOT/notify/dispatch
    expect(warn).toHaveBeenCalledTimes(1);
    expect(outbox[0].processed_at).not.toBeNull(); // marked processed → stops draining (no forever-retry)
  });

  it('marks an unknown event type processed without sending (logs a warn)', async () => {
    const outbox = [{ id: 'ob-x', event_type: 'order.cancelled', aggregate_id: 'order-x', payload: {}, processed_at: null }];
    const boss = { send: vi.fn(() => Promise.resolve()) };
    const supabase = makeSupabase({ outbox, orders: ORDERS });

    await drainOnce({ boss, supabase, logger: noopLogger });

    expect(boss.send).not.toHaveBeenCalled();
    expect(outbox[0].processed_at).not.toBeNull();
  });
});
