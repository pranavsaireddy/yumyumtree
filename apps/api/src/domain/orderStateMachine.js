'use strict';

// Application-layer mirror of the order state machine from architecture §7. The DB's
// transition_order RPC is the ULTIMATE enforcer (INVARIANT: status changes only via RPC);
// this module is a pure, fail-fast guard that rejects illegal transitions BEFORE a DB
// round-trip and powers the future admin "next states" UI. Keep it in lockstep with §7.
//
// VALID_TRANSITIONS is copied verbatim from §7. Frozen so the whitelist can't be mutated
// at runtime; allowedTransitions() hands out copies so callers can't mutate it either.
const VALID_TRANSITIONS = Object.freeze({
  pending_payment: ['placed', 'payment_failed', 'expired'],
  placed: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['dispatched', 'served'], // dispatched=delivery, served=dine-in
  dispatched: ['delivered', 'cancelled'],
  // Terminal states — no further transitions allowed
  delivered: [],
  served: [],
  cancelled: [],
  rejected: [],
  payment_failed: [],
  expired: [],
});

// Build the domain error in the project's { error, code } contract shape: errorHandler
// reads err.status / err.code / err.message off a thrown Error.
function invalidTransitionError(message) {
  const err = new Error(message);
  err.status = 422;
  err.code = 'INVALID_TRANSITION';
  return err;
}

// Throws when `from` is an unknown status or `to` is not whitelisted from `from`.
// Returns nothing on success.
function assertTransition(from, to) {
  if (!Object.prototype.hasOwnProperty.call(VALID_TRANSITIONS, from)) {
    throw invalidTransitionError(`Invalid transition: unknown status "${from}"`);
  }
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw invalidTransitionError(`Invalid transition: ${from} → ${to}`);
  }
}

// The whitelist for `from` (a copy), or [] for an unknown status. Powers the admin UI's
// "what can this order move to next" without exposing the frozen internal array.
function allowedTransitions(from) {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.slice() : [];
}

// True only for a KNOWN status with no outgoing transitions. Unknown statuses → false.
function isTerminal(status) {
  const allowed = VALID_TRANSITIONS[status];
  return Array.isArray(allowed) && allowed.length === 0;
}

module.exports = {
  VALID_TRANSITIONS,
  assertTransition,
  allowedTransitions,
  isTerminal,
};
