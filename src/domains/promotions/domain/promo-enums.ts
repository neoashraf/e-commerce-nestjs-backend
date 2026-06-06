/** Coupon discount kind (SRS 14 §8 Coupon.discount_type). */
export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  FREE_SHIPPING = 'free_shipping',
}

/** Eligibility scope (SRS 14 §8 Coupon.eligibility_scope). */
export enum EligibilityScope {
  ALL = 'all',
  INCLUDE = 'include',
  EXCLUDE = 'exclude',
}

/** Derived coupon lifecycle status (contract: list `status`). */
export enum CouponStatus {
  ACTIVE = 'active',
  SCHEDULED = 'scheduled',
  EXPIRED = 'expired',
  EXHAUSTED = 'exhausted',
  INACTIVE = 'inactive',
}

/** Redemption ledger state (SRS 14 §8 CouponRedemption.status). */
export enum RedemptionStatus {
  APPLIED = 'applied',
  REVERSED = 'reversed',
}
