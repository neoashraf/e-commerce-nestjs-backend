import { ExchangeIneligibleReason } from '../../domain/exchange-enums';
import {
  EligibilityFacts,
  checkExchangeEligibility,
  qaDueAt,
} from '../services/exchange-eligibility';

describe('ORD — Exchange eligibility (FR-ORD-046)', () => {
  const now = new Date('2026-06-06T10:00:00Z');
  const delivered = new Date('2026-06-01T10:00:00Z'); // 5 days ago — within window

  const eligibleFacts: EligibilityFacts = {
    deliveredAt: delivered,
    alreadyExchanged: false,
    isExchangeable: true,
    discountPurchased: false,
  };

  it('should return null when the request is eligible', () => {
    expect(checkExchangeEligibility(eligibleFacts, now)).toBeNull();
  });

  it('should reject already_exchanged before any other reason', () => {
    expect(
      checkExchangeEligibility(
        { ...eligibleFacts, alreadyExchanged: true, deliveredAt: null },
        now,
      ),
    ).toBe(ExchangeIneligibleReason.ALREADY_EXCHANGED);
  });

  it('should reject not_delivered when there is no delivery', () => {
    expect(checkExchangeEligibility({ ...eligibleFacts, deliveredAt: null }, now)).toBe(
      ExchangeIneligibleReason.NOT_DELIVERED,
    );
  });

  it('should reject outside_window past 30 days from delivery', () => {
    const old = new Date('2026-04-01T10:00:00Z');
    expect(checkExchangeEligibility({ ...eligibleFacts, deliveredAt: old }, now)).toBe(
      ExchangeIneligibleReason.OUTSIDE_WINDOW,
    );
  });

  it('should reject non_exchangeable_item', () => {
    expect(checkExchangeEligibility({ ...eligibleFacts, isExchangeable: false }, now)).toBe(
      ExchangeIneligibleReason.NON_EXCHANGEABLE_ITEM,
    );
  });

  it('should reject discount_purchased', () => {
    expect(checkExchangeEligibility({ ...eligibleFacts, discountPurchased: true }, now)).toBe(
      ExchangeIneligibleReason.DISCOUNT_PURCHASED,
    );
  });

  it('should allow the request exactly on the window boundary (day 30)', () => {
    const boundary = new Date('2026-05-07T10:00:00Z'); // exactly 30 days before now
    expect(checkExchangeEligibility({ ...eligibleFacts, deliveredAt: boundary }, now)).toBeNull();
  });
});

describe('ORD — QA due date (FR-ORD-047)', () => {
  it('should land 5 working days out, never on the Friday/Saturday weekend', () => {
    const start = new Date('2026-06-01T10:00:00Z');
    const due = qaDueAt(start);
    // Falls on a working day (skips Fri=5 / Sat=6).
    expect([5, 6]).not.toContain(due.getDay());
    // 5 working days always spans at least one weekend → ≥ 7 calendar days ahead.
    const days = Math.round((due.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBeGreaterThanOrEqual(7);
    expect(days).toBeLessThanOrEqual(7);
  });
});
