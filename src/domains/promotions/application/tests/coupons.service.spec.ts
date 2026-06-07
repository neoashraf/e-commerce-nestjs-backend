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
});
