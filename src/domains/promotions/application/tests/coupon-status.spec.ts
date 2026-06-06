import { deriveStatus } from '../../domain/coupon-status';
import { CouponStatus } from '../../domain/promo-enums';

const base = {
  isActive: true,
  startsAt: new Date('2026-06-01T00:00:00Z'),
  endsAt: new Date('2026-06-30T00:00:00Z'),
  totalUsed: 0,
  totalUsageLimit: 100,
};
const DURING = new Date('2026-06-15T00:00:00Z');

describe('Promotions — deriveStatus', () => {
  it('should be inactive when manually off (highest precedence)', () => {
    expect(deriveStatus({ ...base, isActive: false }, DURING)).toBe(CouponStatus.INACTIVE);
  });

  it('should be exhausted when used >= total limit', () => {
    expect(deriveStatus({ ...base, totalUsed: 100 }, DURING)).toBe(CouponStatus.EXHAUSTED);
  });

  it('should be scheduled before the window', () => {
    expect(deriveStatus(base, new Date('2026-05-20T00:00:00Z'))).toBe(CouponStatus.SCHEDULED);
  });

  it('should be expired after the window', () => {
    expect(deriveStatus(base, new Date('2026-07-05T00:00:00Z'))).toBe(CouponStatus.EXPIRED);
  });

  it('should be active within the window with remaining usage', () => {
    expect(deriveStatus(base, DURING)).toBe(CouponStatus.ACTIVE);
  });

  it('should treat a null usage limit as unlimited (never exhausted)', () => {
    expect(deriveStatus({ ...base, totalUsed: 9999, totalUsageLimit: null }, DURING)).toBe(
      CouponStatus.ACTIVE,
    );
  });
});
