import { ReportRange } from './orders-read.port';

/** One per-coupon performance row (FR-RPT-051). */
export interface CouponPerformanceRow {
  coupon_code: string;
  /** Count of `applied` (non-reversed) redemptions in the period. */
  redemptions: number;
  /** Σ discount_amount over applied redemptions (BDT, 2dp string). */
  discount_given: string;
  /** Σ grand_total of orders that *used* the coupon (documented attribution, §12.9) (BDT, 2dp string). */
  attributed_sales: string;
}

/**
 * Read-only view RPT takes over PROMO (coupon redemptions). Attribution rule (§12.9, documented): sales
 * are attributed to a coupon for orders that *used* it (the redemption's order), so the same order is
 * never double-counted across coupons. Redemptions are filtered to `applied` status and the period of the
 * redemption. Read-side only (BR-RPT-5); decoupled from PROMO ORM classes (table/column names only).
 */
export interface IPromotionsReadModel {
  /** Per-coupon redemptions / discount given / attributed sales for the period (FR-RPT-051). */
  getCouponPerformance(range: ReportRange): Promise<CouponPerformanceRow[]>;
}

export const PROMOTIONS_READ_MODEL = Symbol('IPromotionsReadModel');
