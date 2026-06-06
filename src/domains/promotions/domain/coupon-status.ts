import { CouponStatus } from './promo-enums';

/** The coupon fields needed to derive lifecycle status (shared by the list + the engine). */
export interface CouponStatusInput {
  isActive: boolean;
  startsAt: Date;
  endsAt: Date;
  totalUsed: number;
  totalUsageLimit: number | null;
}

/**
 * Derive a coupon's lifecycle status (contract list `status`; AC4). Precedence: manual off → inactive;
 * exhausted (used ≥ limit) → exhausted; before window → scheduled; after window → expired; else active.
 * `deriveStatus` is the single source reused by the admin list and the redemption engine.
 */
export function deriveStatus(c: CouponStatusInput, now: Date = new Date()): CouponStatus {
  if (!c.isActive) return CouponStatus.INACTIVE;
  if (c.totalUsageLimit !== null && c.totalUsed >= c.totalUsageLimit) return CouponStatus.EXHAUSTED;
  if (now < c.startsAt) return CouponStatus.SCHEDULED;
  if (now > c.endsAt) return CouponStatus.EXPIRED;
  return CouponStatus.ACTIVE;
}
