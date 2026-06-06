import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CouponEngineService, ValidateCommand } from '../services/coupon-engine.service';
import { DiscountType, EligibilityScope, RedemptionStatus } from '../../domain/promo-enums';
import { CouponOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';
import { ORDER_HISTORY_READER } from '../ports/order-history-reader.port';

const NOW = new Date('2026-06-10T00:00:00Z');

const buildCoupon = (o: Partial<CouponOrmEntity> = {}): CouponOrmEntity =>
  ({
    id: 'cp_1',
    code: 'EID500',
    description: null,
    discountType: DiscountType.FIXED,
    value: '500.00',
    maxDiscountAmount: null,
    minOrderSubtotal: null,
    eligibilityScope: EligibilityScope.ALL,
    eligibleCategoryIds: [],
    eligibleProductIds: [],
    startsAt: new Date('2026-06-01T00:00:00Z'),
    endsAt: new Date('2026-06-20T23:59:59Z'),
    totalUsageLimit: null,
    perCustomerLimit: null,
    firstOrderOnly: false,
    totalUsed: 0,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...o,
  }) as CouponOrmEntity;

const buildCart = (subtotal = '12500.00'): ValidateCommand['cart'] => ({
  lines: [
    { product_id: 'p1', category_id: 'cat_fb', quantity: 1, effective_unit_price: subtotal },
  ],
  subtotal,
});

describe('Promotions — CouponEngineService', () => {
  let service: CouponEngineService;
  let coupons: { findOne: jest.Mock; createQueryBuilder: jest.Mock; save: jest.Mock };
  let redemptions: { findOne: jest.Mock; count: jest.Mock; save: jest.Mock; create: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let history: { hasPriorCompletedOrder: jest.Mock };

  // A fake EntityManager whose getRepository returns the mocked repos.
  const fakeManager = () => ({
    getRepository: (token: unknown) => {
      if (token === CouponOrmEntity) return coupons;
      return redemptions;
    },
  });

  beforeEach(async () => {
    coupons = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };
    redemptions = {
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn().mockImplementation((r) => Promise.resolve({ id: 'rdm_1', ...r })),
      create: jest.fn().mockImplementation((r) => r),
    };
    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => cb(fakeManager())),
    };
    history = { hasPriorCompletedOrder: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponEngineService,
        { provide: getRepositoryToken(CouponOrmEntity), useValue: coupons },
        { provide: getRepositoryToken(CouponRedemptionOrmEntity), useValue: redemptions },
        { provide: DataSource, useValue: dataSource },
        { provide: ORDER_HISTORY_READER, useValue: history },
      ],
    }).compile();

    service = module.get(CouponEngineService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- validate ---

  it('should return valid + fixed discount when the coupon applies', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ discountType: DiscountType.FIXED, value: '500.00' }));
    const result = await service.validate(
      { code: 'eid500', identity: {}, cart: buildCart('12500.00') },
      NOW,
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.discount_amount).toBe('500.00');
      expect(result.eligible_subtotal).toBe('12500.00');
      expect(result.free_shipping).toBe(false);
    }
  });

  it('should cap a percentage discount at max_discount_amount', async () => {
    coupons.findOne.mockResolvedValue(
      buildCoupon({ discountType: DiscountType.PERCENTAGE, value: '10.00', maxDiscountAmount: '500.00' }),
    );
    const result = await service.validate(
      { code: 'BOOT10', identity: {}, cart: buildCart('12500.00') },
      NOW,
    );
    // 10% of 12500 = 1250, capped to 500.
    expect(result.valid && result.discount_amount).toBe('500.00');
  });

  it('should never let the discount exceed the eligible subtotal', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ discountType: DiscountType.FIXED, value: '5000.00' }));
    const result = await service.validate(
      { code: 'EID500', identity: {}, cart: buildCart('2000.00') },
      NOW,
    );
    expect(result.valid && result.discount_amount).toBe('2000.00');
  });

  it('should return free_shipping directive with zero discount', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ discountType: DiscountType.FREE_SHIPPING }));
    const result = await service.validate(
      { code: 'FREESHIP', identity: {}, cart: buildCart('1000.00') },
      NOW,
    );
    expect(result.valid).toBe(true);
    expect(result.valid && result.free_shipping).toBe(true);
    expect(result.valid && result.discount_amount).toBe('0.00');
  });

  it('should compute discount on the eligible subtotal only for an include scope', async () => {
    coupons.findOne.mockResolvedValue(
      buildCoupon({
        discountType: DiscountType.PERCENTAGE,
        value: '10.00',
        eligibilityScope: EligibilityScope.INCLUDE,
        eligibleCategoryIds: ['cat_fb'],
      }),
    );
    const cart: ValidateCommand['cart'] = {
      lines: [
        { product_id: 'p1', category_id: 'cat_fb', quantity: 1, effective_unit_price: '10000.00' },
        { product_id: 'p2', category_id: 'cat_jersey', quantity: 1, effective_unit_price: '5000.00' },
      ],
      subtotal: '15000.00',
    };
    const result = await service.validate({ code: 'BOOT10', identity: {}, cart }, NOW);
    // eligible = 10000; 10% = 1000.
    expect(result.valid && result.eligible_subtotal).toBe('10000.00');
    expect(result.valid && result.discount_amount).toBe('1000.00');
  });

  it('should return not_found when the code does not resolve', async () => {
    coupons.findOne.mockResolvedValue(null);
    const result = await service.validate({ code: 'NOPE', identity: {}, cart: buildCart() }, NOW);
    expect(result).toMatchObject({ valid: false, reason: 'not_found' });
  });

  it('should return expired past the window', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ endsAt: new Date('2026-06-05T00:00:00Z') }));
    const result = await service.validate({ code: 'EID500', identity: {}, cart: buildCart() }, NOW);
    expect(result).toMatchObject({ valid: false, reason: 'expired' });
  });

  it('should return inactive for a deactivated coupon', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ isActive: false }));
    const result = await service.validate({ code: 'EID500', identity: {}, cart: buildCart() }, NOW);
    expect(result).toMatchObject({ valid: false, reason: 'inactive' });
  });

  it('should return min_order_not_met below the minimum subtotal', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ minOrderSubtotal: '2000.00' }));
    const result = await service.validate({ code: 'EID500', identity: {}, cart: buildCart('1500.00') }, NOW);
    expect(result).toMatchObject({ valid: false, reason: 'min_order_not_met' });
  });

  it('should return first_order_only for a returning customer', async () => {
    coupons.findOne.mockResolvedValue(buildCoupon({ firstOrderOnly: true }));
    history.hasPriorCompletedOrder.mockResolvedValue(true);
    const result = await service.validate(
      { code: 'EID500', identity: { customer_id: 'c1' }, cart: buildCart() },
      NOW,
    );
    expect(result).toMatchObject({ valid: false, reason: 'first_order_only' });
  });

  // --- redeem ---

  const lockedCoupon = (coupon: CouponOrmEntity) => {
    coupons.createQueryBuilder.mockReturnValue({
      setLock: () => ({ where: () => ({ getOne: () => Promise.resolve(coupon) }) }),
    });
  };

  it('should record a redemption and increment total_used atomically', async () => {
    const coupon = buildCoupon({ totalUsed: 0, totalUsageLimit: 10 });
    lockedCoupon(coupon);
    const result = await service.redeem(
      { code: 'EID500', order_id: 'ord_1', identity: { customer_id: 'c1' }, discount_amount: '500.00' },
      NOW,
    );
    expect(result.redeemed).toBe(true);
    expect(redemptions.save).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'ord_1', status: RedemptionStatus.APPLIED }),
    );
    expect(coupons.save).toHaveBeenCalledWith(expect.objectContaining({ totalUsed: 1 }));
  });

  it('should be idempotent: a replay returns the existing redemption without double-incrementing', async () => {
    redemptions.findOne.mockResolvedValue({ id: 'rdm_existing', status: RedemptionStatus.APPLIED });
    const result = await service.redeem(
      { code: 'EID500', order_id: 'ord_1', identity: {}, discount_amount: '500.00' },
      NOW,
    );
    expect(result).toMatchObject({ redeemed: true, redemption_id: 'rdm_existing', already_applied: true });
    expect(coupons.save).not.toHaveBeenCalled();
  });

  it('should reject redeem with 409 USAGE_LIMIT_REACHED when the total cap is hit', async () => {
    lockedCoupon(buildCoupon({ totalUsed: 10, totalUsageLimit: 10 }));
    await expect(
      service.redeem(
        { code: 'EID500', order_id: 'ord_2', identity: {}, discount_amount: '500.00' },
        NOW,
      ),
    ).rejects.toMatchObject({ response: { code: 'USAGE_LIMIT_REACHED' } });
    expect(redemptions.save).not.toHaveBeenCalled();
  });

  it('should reject redeem with 409 PER_CUSTOMER_LIMIT_REACHED when the per-customer cap is hit', async () => {
    lockedCoupon(buildCoupon({ perCustomerLimit: 1 }));
    redemptions.count.mockResolvedValue(1);
    await expect(
      service.redeem(
        { code: 'EID500', order_id: 'ord_3', identity: { customer_id: 'c1' }, discount_amount: '500.00' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('should reject redeem with COUPON_INVALID when the coupon expired by placement', async () => {
    lockedCoupon(buildCoupon({ endsAt: new Date('2026-06-05T00:00:00Z') }));
    await expect(
      service.redeem(
        { code: 'EID500', order_id: 'ord_4', identity: {}, discount_amount: '500.00' },
        NOW,
      ),
    ).rejects.toMatchObject({ response: { code: 'COUPON_INVALID', reason: 'expired' } });
  });

  // --- reverse ---

  it('should reverse an applied redemption and free a use', async () => {
    redemptions.findOne.mockResolvedValue({
      id: 'rdm_1',
      couponId: 'cp_1',
      status: RedemptionStatus.APPLIED,
    });
    coupons.createQueryBuilder.mockReturnValue({
      setLock: () => ({ where: () => ({ getOne: () => Promise.resolve(buildCoupon({ totalUsed: 3 })) }) }),
    });
    const result = await service.reverse('ord_1', NOW);
    expect(result).toEqual({ reversed: true });
    expect(redemptions.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: RedemptionStatus.REVERSED }),
    );
    expect(coupons.save).toHaveBeenCalledWith(expect.objectContaining({ totalUsed: 2 }));
  });

  it('should be a no-op when there is no applied redemption to reverse (idempotent)', async () => {
    redemptions.findOne.mockResolvedValue(null);
    const result = await service.reverse('ord_unknown', NOW);
    expect(result).toEqual({ reversed: true });
    expect(coupons.save).not.toHaveBeenCalled();
  });
});
