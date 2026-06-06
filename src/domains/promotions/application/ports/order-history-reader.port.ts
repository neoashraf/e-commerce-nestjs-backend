import { Injectable } from '@nestjs/common';

/**
 * Identity of the shopper a coupon is being validated/redeemed for. Either a registered
 * customer (by id) or a guest (by phone). Per-customer caps and first-order-only key on
 * whichever is present (BR-PROMO-7/9).
 */
export interface CouponIdentity {
  customer_id?: string | null;
  guest_phone?: string | null;
}

/**
 * Outbound port to read a shopper's order history for the first-order-only check
 * (FR-PROMO-007/024, BR-PROMO-9). The real impl reads completed orders from AUTH/ORD;
 * until that seam is wired, {@link StubOrderHistoryReader} treats everyone as having no
 * prior order (so first-order-only never blocks) and the engine notes the assumption.
 */
export interface IOrderHistoryReader {
  /** Whether the identity has at least one prior completed (non-cancelled) order. */
  hasPriorCompletedOrder(identity: CouponIdentity): Promise<boolean>;
}

export const ORDER_HISTORY_READER = Symbol('IOrderHistoryReader');

/**
 * Default stub for the first-order-only check until AUTH/ORD order history is wired
 * through this port. Conservatively reports "no prior order" so first-order-only
 * coupons stay usable; swap for an ORD/AUTH-backed adapter at integration.
 */
@Injectable()
export class StubOrderHistoryReader implements IOrderHistoryReader {
  async hasPriorCompletedOrder(): Promise<boolean> {
    return false;
  }
}
