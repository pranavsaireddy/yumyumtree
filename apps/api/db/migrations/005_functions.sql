-- 005_functions.sql
-- CREATE OR REPLACE makes each function idempotent.
-- Requires 001 and 002 to have been applied first.

-- ---------------------------------------------------------------------------
-- confirm_order
-- Called by the Razorpay webhook handler after HMAC verification.
-- Atomically: deduplicates the webhook, advances the order to 'placed',
-- appends an audit event, and writes an outbox row for downstream jobs.
-- Re-entrant: a duplicate (source, event_id, event_type) is a silent no-op.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION confirm_order(
  p_order_id       uuid,
  p_payment_id     text,
  p_webhook_source text,
  p_webhook_event  text,
  p_raw_payload    jsonb
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Idempotency guard: already processed → return without touching anything.
  IF EXISTS (
    SELECT 1 FROM processed_webhooks
    WHERE source     = p_webhook_source
      AND event_id   = p_payment_id
      AND event_type = p_webhook_event
  ) THEN
    RETURN;
  END IF;

  -- Dedup record. The UNIQUE constraint on (source, event_id, event_type) acts
  -- as a second guard against concurrent duplicate calls racing past the IF above.
  INSERT INTO processed_webhooks (source, event_id, event_type, raw_payload)
  VALUES (p_webhook_source, p_payment_id, p_webhook_event, p_raw_payload);

  -- Advance the order only if it is still awaiting payment.
  -- The AND status = 'pending_payment' guard is intentional: if a concurrent call
  -- already moved the order forward, this UPDATE silently matches zero rows.
  UPDATE orders
  SET status              = 'placed',
      razorpay_payment_id = p_payment_id,
      placed_at           = now()
  WHERE id     = p_order_id
    AND status = 'pending_payment';

  -- Audit trail.
  INSERT INTO order_events (order_id, event, actor, payload)
  VALUES (
    p_order_id,
    'payment_confirmed',
    'system',
    jsonb_build_object('razorpay_payment_id', p_payment_id)
  );

  -- Outbox row: picked up by the drain worker to fan out pg-boss jobs
  -- (pos.pushKot, notify.statusChanged, delivery.dispatch).
  INSERT INTO outbox (aggregate, aggregate_id, event_type, payload)
  VALUES (
    'order',
    p_order_id,
    'order.placed',
    jsonb_build_object('orderId', p_order_id)
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- transition_order
-- The ONLY permitted way to change orders.status (INVARIANT §3).
-- Acquires a row-level lock, enforces the §7 whitelist, updates status,
-- and appends an order_events row — all in one atomic operation.
-- Raises on any transition not in the whitelist, including all terminal states.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION transition_order(
  p_order_id   uuid,
  p_new_status text,
  p_event      text,
  p_actor      text,
  p_payload    jsonb DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_current text;
BEGIN
  -- Lock the row for the duration of this transaction to prevent concurrent races.
  SELECT status INTO v_current
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Exact §7 whitelist. Any transition not listed here is invalid,
  -- including all terminal→anything and any skipped-step attempt.
  IF NOT (
    (v_current = 'pending_payment' AND p_new_status IN ('placed', 'payment_failed', 'expired'))  OR
    (v_current = 'placed'          AND p_new_status IN ('confirmed', 'rejected', 'cancelled'))   OR
    (v_current = 'confirmed'       AND p_new_status IN ('preparing', 'cancelled'))               OR
    (v_current = 'preparing'       AND p_new_status  = 'ready')                                  OR
    (v_current = 'ready'           AND p_new_status IN ('dispatched', 'served'))                 OR
    (v_current = 'dispatched'      AND p_new_status IN ('delivered', 'cancelled'))
  ) THEN
    RAISE EXCEPTION 'Invalid transition: % → %', v_current, p_new_status;
  END IF;

  UPDATE orders
  SET status = p_new_status
  WHERE id = p_order_id;

  INSERT INTO order_events (order_id, event, actor, payload)
  VALUES (
    p_order_id,
    p_event,
    p_actor,
    p_payload || jsonb_build_object('from', v_current, 'to', p_new_status)
  );
END;
$$;
