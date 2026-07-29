import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { CouponsService, CreateCouponCommand } from '../services/coupons.service';
import { DiscountType, EligibilityScope } from '../../domain/promo-enums';
import { CouponOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';

describe('Promotions — CouponsService', () => {
  let service: CouponsService;
  let coupons: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; softDelete: jest.Mock; createQueryBuilder: jest.Mock };
  let redemptions: { count: jest.Mock };

  const buildCmd = (o: Partial<CreateCouponCommand> = {}): CreateCouponCommand => ({
    code: 'boot10',
    discount_type: DiscountType.PERCENTAGE,
    value: '10.00',
    starts_at: '2026-06-05T00:00:00Z',
    ends_at: '2026-06-20T23:59:59Z',
    ...o,
  });

  beforeEach(async () => {
    coupons = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((c) => Promise.resolve({ id: 'cp_1', ...c })),
      create: jest.fn().mockImplementation((c) => c),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };
    redemptions = { count: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouponsService,
        { provide: getRepositoryToken(CouponOrmEntity), useValue: coupons },
        { provide: getRepositoryToken(CouponRedemptionOrmEntity), useValue: redemptions },
      ],
    }).compile();
    service = module.get(CouponsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should normalize the code to uppercase on create (BR-PROMO-1)', async () => {
    const coupon = await service.create(buildCmd({ code: 'boot10' }));
    expect(coupon.code).toBe('BOOT10');
  });

  it('should 409 on a duplicate case-insensitive code (FR-PROMO-009)', async () => {
    coupons.findOne.mockResolvedValue({ id: 'other', code: 'BOOT10' });
    await expect(service.create(buildCmd())).rejects.toThrow(ConflictException);
  });

  it('should 400 when ends_at <= starts_at', async () => {
    await expect(
      service.create(buildCmd({ starts_at: '2026-06-20T00:00:00Z', ends_at: '2026-06-05T00:00:00Z' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('should 400 on a percentage value out of 0–100', async () => {
    await expect(service.create(buildCmd({ value: '150' }))).rejects.toThrow(BadRequestException);
  });

  it('should 400 on include scope with no targets', async () => {
    await expect(
      service.create(
        buildCmd({ eligibility_scope: EligibilityScope.INCLUDE, eligible_category_ids: [], eligible_product_ids: [] }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should ignore value validation for free_shipping', async () => {
    const coupon = await service.create(buildCmd({ discount_type: DiscountType.FREE_SHIPPING, value: undefined }));
    expect(coupon.discountType).toBe(DiscountType.FREE_SHIPPING);
  });

  it('should block changing the code once redemptions exist (FR-PROMO-008)', async () => {
    coupons.findOne.mockResolvedValue({
      id: 'cp_1',
      code: 'BOOT10',
      startsAt: new Date('2026-06-05T00:00:00Z'),
      endsAt: new Date('2026-06-20T00:00:00Z'),
      discountType: DiscountType.PERCENTAGE,
      value: '10',
      eligibilityScope: EligibilityScope.ALL,
      eligibleCategoryIds: [],
      eligibleProductIds: [],
    });
    redemptions.count.mockResolvedValue(3);
    await expect(service.update('cp_1', { code: 'NEWCODE' })).rejects.toMatchObject({
      response: { code: 'CODE_IMMUTABLE' },
    });
  });

  it('should soft-delete a coupon (redemptions retained)', async () => {
    await service.remove('cp_1');
    expect(coupons.softDelete).toHaveBeenCalledWith({ id: 'cp_1' });
  });

  describe('getDetail — contract shape for the admin editor', () => {
    const ormRow = {
      id: 'cp_1',
      code: 'BOOT10',
      description: '10% off boots',
      discountType: DiscountType.PERCENTAGE,
      value: '10.00',
      maxDiscountAmount: '500.00',
      minOrderSubtotal: '2000.00',
      eligibilityScope: EligibilityScope.ALL,
      eligibleCategoryIds: ['cat_1'],
      eligibleProductIds: [],
      startsAt: new Date('2026-06-05T00:00:00Z'),
      endsAt: new Date('2026-06-20T23:59:59Z'),
      totalUsageLimit: 100,
      perCustomerLimit: 1,
      firstOrderOnly: true,
      totalUsed: 2,
      isActive: true,
      createdAt: new Date('2026-06-01T00:00:00Z'),
      updatedAt: new Date('2026-06-01T00:00:00Z'),
      deletedAt: null,
    };

    it('should return every editor field in snake_case, not the camelCase ORM entity', async () => {
      coupons.findOne.mockResolvedValue(ormRow);
      const detail = await service.getDetail('cp_1', new Date('2026-06-10T00:00:00Z'));
      expect(detail).toMatchObject({
        id: 'cp_1',
        code: 'BOOT10',
        description: '10% off boots',
        discount_type: DiscountType.PERCENTAGE,
        value: '10.00',
        max_discount_amount: '500.00',
        min_order_subtotal: '2000.00',
        eligibility_scope: EligibilityScope.ALL,
        eligible_category_ids: ['cat_1'],
        eligible_product_ids: [],
        total_used: 2,
        total_usage_limit: 100,
        per_customer_limit: 1,
        first_order_only: true,
        is_active: true,
      });
      expect(detail.starts_at).toEqual(ormRow.startsAt);
      expect(detail.ends_at).toEqual(ormRow.endsAt);
    });

    it('should derive status and leak no ORM internals', async () => {
      coupons.findOne.mockResolvedValue(ormRow);
      const detail = await service.getDetail('cp_1', new Date('2026-06-10T00:00:00Z'));
      expect(detail.status).toBe('active');
      expect(Object.keys(detail)).toEqual(
        expect.not.arrayContaining(['discountType', 'isActive', 'deletedAt', 'createdAt']),
      );
    });

    it('should 404 when the coupon does not exist', async () => {
      coupons.findOne.mockResolvedValue(null);
      await expect(service.getDetail('missing')).rejects.toMatchObject({
        response: { code: 'COUPON_NOT_FOUND' },
      });
    });
  });
});
