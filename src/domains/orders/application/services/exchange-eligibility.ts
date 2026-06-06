import {
  EXCHANGE_QA_WORKING_DAYS,
  EXCHANGE_WINDOW_DAYS,
  ExchangeIneligibleReason,
} from '../../domain/exchange-enums';

/** Facts the eligibility rule needs about a requested exchange (FR-ORD-046, BR-ORD-9). */
export interface EligibilityFacts {
  /** When the order item was delivered — `null` if there is no `delivered` history yet. */
  deliveredAt: Date | null;
  /** Whether this order item already has a non-rejected exchange (once-per-item rule). */
  alreadyExchanged: boolean;
  /** Whether the original product/category is exchangeable (CAT config). */
  isExchangeable: boolean;
  /** Whether the item was bought on a coupon/promotion (discount-purchased items are excluded). */
  discountPurchased: boolean;
}

/**
 * Up-front exchange eligibility (FR-ORD-046, BR-ORD-9). Returns the first failing
 * {@link ExchangeIneligibleReason}, or `null` when the request is eligible. Ordering is deliberate:
 * the once-per-item check runs before the delivered check so a second request on an already-exchanged
 * item reports `already_exchanged` rather than `not_delivered` (the order has since left `delivered`).
 */
export function checkExchangeEligibility(
  facts: EligibilityFacts,
  now: Date = new Date(),
): ExchangeIneligibleReason | null {
  if (facts.alreadyExchanged) return ExchangeIneligibleReason.ALREADY_EXCHANGED;
  if (!facts.deliveredAt) return ExchangeIneligibleReason.NOT_DELIVERED;

  const windowEnd = new Date(facts.deliveredAt);
  windowEnd.setDate(windowEnd.getDate() + EXCHANGE_WINDOW_DAYS);
  if (now > windowEnd) return ExchangeIneligibleReason.OUTSIDE_WINDOW;

  if (!facts.isExchangeable) return ExchangeIneligibleReason.NON_EXCHANGEABLE_ITEM;
  if (facts.discountPurchased) return ExchangeIneligibleReason.DISCOUNT_PURCHASED;
  return null;
}

/**
 * QA target for a quality-defect claim: {@link EXCHANGE_QA_WORKING_DAYS} working days from now,
 * skipping the Bangladesh weekend (Friday + Saturday) (FR-ORD-047).
 */
export function qaDueAt(now: Date = new Date()): Date {
  const due = new Date(now);
  let remaining = EXCHANGE_QA_WORKING_DAYS;
  while (remaining > 0) {
    due.setDate(due.getDate() + 1);
    const day = due.getDay(); // 0=Sun … 5=Fri, 6=Sat
    if (day !== 5 && day !== 6) remaining -= 1;
  }
  return due;
}
