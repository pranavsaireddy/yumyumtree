'use strict';

// describe/it/expect are globals (vitest.config.js → test.globals). Pure unit suite —
// no DB, so no assertSafeTestDb (that guard is only for DB-touching suites).
const {
  VALID_TRANSITIONS,
  assertTransition,
  allowedTransitions,
  isTerminal,
} = require('../../domain/orderStateMachine');

const ALL_STATUSES = Object.keys(VALID_TRANSITIONS);
const TERMINAL_STATUSES = [
  'delivered',
  'served',
  'cancelled',
  'rejected',
  'payment_failed',
  'expired',
];

describe('orderStateMachine', () => {
  describe('assertTransition — every whitelisted transition passes', () => {
    // Drive directly off the §7 table so the test can't drift from the source of truth.
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        it(`allows ${from} → ${to}`, () => {
          expect(() => assertTransition(from, to)).not.toThrow();
        });
      }
    }
  });

  describe('assertTransition — representative invalid transitions reject', () => {
    const invalid = [
      ['delivered', 'preparing'],
      ['cancelled', 'dispatched'],
      ['served', 'dispatched'],
      ['preparing', 'placed'],
    ];
    for (const [from, to] of invalid) {
      it(`rejects ${from} → ${to} with 422 INVALID_TRANSITION`, () => {
        expect(() => assertTransition(from, to)).toThrow();
        try {
          assertTransition(from, to);
        } catch (err) {
          expect(err.status).toBe(422);
          expect(err.code).toBe('INVALID_TRANSITION');
        }
      });
    }
  });

  describe('terminal states reject ALL outgoing transitions', () => {
    for (const from of TERMINAL_STATUSES) {
      it(`${from} is terminal and rejects every target status`, () => {
        expect(isTerminal(from)).toBe(true);
        for (const to of ALL_STATUSES) {
          expect(() => assertTransition(from, to)).toThrow();
        }
      });
    }
  });

  it('rejects an unknown from-state', () => {
    expect(() => assertTransition('banana', 'placed')).toThrow();
    try {
      assertTransition('banana', 'placed');
    } catch (err) {
      expect(err.status).toBe(422);
      expect(err.code).toBe('INVALID_TRANSITION');
    }
  });

  describe('allowedTransitions', () => {
    it('returns the whitelist array for a known state', () => {
      expect(allowedTransitions('ready')).toEqual(['dispatched', 'served']);
    });

    it('returns a copy — mutating it does not corrupt the table', () => {
      allowedTransitions('ready').push('hacked');
      expect(allowedTransitions('ready')).toEqual(['dispatched', 'served']);
    });

    it('returns [] for an unknown state', () => {
      expect(allowedTransitions('banana')).toEqual([]);
    });
  });

  describe('isTerminal', () => {
    it('is true for a terminal state', () => {
      expect(isTerminal('delivered')).toBe(true);
    });

    it('is false for a non-terminal state', () => {
      expect(isTerminal('placed')).toBe(false);
    });

    it('is false for an unknown state', () => {
      expect(isTerminal('banana')).toBe(false);
    });
  });
});
