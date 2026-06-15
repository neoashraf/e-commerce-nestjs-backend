/**
 * Outbound port AUTH uses to link a phone's prior **guest** orders (placed with no account) to the
 * customer once that phone is proven owned via OTP (FR-AUTH-072 spirit: same phone → same buyer).
 * Implemented by an ORD adapter; degrades gracefully (never throws into the login/registration path).
 */
export interface IGuestOrderClaimPort {
  /**
   * Attach every unclaimed guest order for `phone` (E.164) to `customerId`. Idempotent — only rows
   * with a null customer_id are touched. Returns how many orders were claimed.
   */
  claimByPhone(phone: string, customerId: string): Promise<number>;
}

export const GUEST_ORDER_CLAIM_PORT = Symbol('IGuestOrderClaimPort');
