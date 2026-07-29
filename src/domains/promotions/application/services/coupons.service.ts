import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import { deriveStatus } from '../../domain/coupon-status';
import {
  CouponStatus,
  DiscountType,
  EligibilityScope,
  RedemptionStatus,
} from '../../domain/promo-enums';
import { CouponOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';

export interface CreateCouponCommand {
  code: string;
  description?: string | null;
  discount_type: DiscountType;
  value?: string;
  max_discount_amount?: string | null;
  min_order_subtotal?: string | null;
  eligibility_scope?: EligibilityScope;
  eligible_category_ids?: string[];
  eligible_product_ids?: string[];
  starts_at: string;
  ends_at: string;
  total_usage_limit?: number | null;
  per_customer_limit?: number | null;
  first_order_only?: boolean;
  is_active?: boolean;
}

export type UpdateCouponCommand = Partial<CreateCouponCommand>;

export interface CouponListRow {
  id: string;
  code: string;
  discount_type: string;
  value: string;
  starts_at: Date;
  ends_at: Date;
  total_used: number;
  total_usage_limit: number | null;
  is_active: boolean;
  status: CouponStatus;
}

/**
 * Coupon detail in contract shape (GET /admin/coupons/{id}, PATCH response) — the list row plus the
 * editor-only fields. Deliberately mapped rather than returning `CouponOrmEntity`: the ORM entity is
 * camelCase (`discountType`, `isActive`, …) and carries internals (`deletedAt`, timestamps), so
 * handing it straight to the client broke every field the admin coupon editor binds.
 */
export interface CouponDetailView extends CouponListRow {
  description: string | null;
  max_discount_amount: string | null;
  min_order_subtotal: string | null;
  eligibility_scope: string;
  eligible_category_ids: string[];
  eligible_product_ids: string[];
  per_customer_limit: number | null;
  first_order_only: boolean;
}

export interface RedemptionsView {
  summary: { total_used: number; total_usage_limit: number | null; remaining: number | null };
  redemptions: {
    id: string;
    order_id: string;
    customer_id: string | null;
    discount_amount: string;
    status: string;
    created_at: Date;
  }[];
  meta: { page: number; limit: number; total: number };
}

/**
 * Admin coupon management (FR-PROMO-001–009, 030/031). Owns the `Coupon`/`CouponRedemption` entities the
 * validate/redeem/reverse engine (promo-engine-be) builds on. Codes are normalized uppercase + unique
 * case-insensitively (BR-PROMO-1); a code is immutable once any redemption exists. CRUD validates the
 * window, percentage range, and include/exclude scope targets. The shared `deriveStatus` drives the list
 * filter. Soft-delete retains redemptions.
 */
@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(CouponOrmEntity)
    private readonly coupons: Repository<CouponOrmEntity>,
    @InjectRepository(CouponRedemptionOrmEntity)
    private readonly redemptions: Repository<CouponRedemptionOrmEntity>,
  ) {}

  async create(cmd: CreateCouponCommand): Promise<CouponOrmEntity> {
    const code = this.normalizeCode(cmd.code);
    await this.assertCodeFree(code, null);
    const [startsAt, endsAt] = this.assertWindow(cmd.starts_at, cmd.ends_at);
    this.assertValue(cmd.discount_type, cmd.value);
    this.assertScope(
      cmd.eligibility_scope ?? EligibilityScope.ALL,
      cmd.eligible_category_ids ?? [],
      cmd.eligible_product_ids ?? [],
    );

    return this.coupons.save(
      this.coupons.create({
        code,
        description: cmd.description ?? null,
        discountType: cmd.discount_type,
        value: cmd.value ?? '0',
        maxDiscountAmount: cmd.max_discount_amount ?? null,
        minOrderSubtotal: cmd.min_order_subtotal ?? null,
        eligibilityScope: cmd.eligibility_scope ?? EligibilityScope.ALL,
        eligibleCategoryIds: cmd.eligible_category_ids ?? [],
        eligibleProductIds: cmd.eligible_product_ids ?? [],
        startsAt,
        endsAt,
        totalUsageLimit: cmd.total_usage_limit ?? null,
        perCustomerLimit: cmd.per_customer_limit ?? null,
        firstOrderOnly: cmd.first_order_only ?? false,
        isActive: cmd.is_active ?? true,
      }),
    );
  }

  async update(id: string, cmd: UpdateCouponCommand): Promise<CouponOrmEntity> {
    const coupon = await this.getById(id);

    if (cmd.code !== undefined) {
      const nextCode = this.normalizeCode(cmd.code);
      if (nextCode !== coupon.code) {
        // Code immutable once redeemed (FR-PROMO-008 note).
        if (await this.hasRedemptions(id)) {
          throw new ConflictException({
            code: 'CODE_IMMUTABLE',
            message: 'Coupon code cannot change after it has been redeemed.',
          });
        }
        await this.assertCodeFree(nextCode, id);
        coupon.code = nextCode;
      }
    }
    const startsRaw = cmd.starts_at ?? coupon.startsAt.toISOString();
    const endsRaw = cmd.ends_at ?? coupon.endsAt.toISOString();
    if (cmd.starts_at !== undefined || cmd.ends_at !== undefined) {
      const [startsAt, endsAt] = this.assertWindow(startsRaw, endsRaw);
      coupon.startsAt = startsAt;
      coupon.endsAt = endsAt;
    }
    if (cmd.discount_type !== undefined || cmd.value !== undefined) {
      this.assertValue(cmd.discount_type ?? (coupon.discountType as DiscountType), cmd.value ?? coupon.value);
      if (cmd.discount_type !== undefined) coupon.discountType = cmd.discount_type;
      if (cmd.value !== undefined) coupon.value = cmd.value;
    }
    if (
      cmd.eligibility_scope !== undefined ||
      cmd.eligible_category_ids !== undefined ||
      cmd.eligible_product_ids !== undefined
    ) {
      const scope = cmd.eligibility_scope ?? (coupon.eligibilityScope as EligibilityScope);
      const cats = cmd.eligible_category_ids ?? coupon.eligibleCategoryIds;
      const prods = cmd.eligible_product_ids ?? coupon.eligibleProductIds;
      this.assertScope(scope, cats, prods);
      coupon.eligibilityScope = scope;
      coupon.eligibleCategoryIds = cats;
      coupon.eligibleProductIds = prods;
    }
    if (cmd.description !== undefined) coupon.description = cmd.description;
    if (cmd.max_discount_amount !== undefined) coupon.maxDiscountAmount = cmd.max_discount_amount;
    if (cmd.min_order_subtotal !== undefined) coupon.minOrderSubtotal = cmd.min_order_subtotal;
    if (cmd.total_usage_limit !== undefined) coupon.totalUsageLimit = cmd.total_usage_limit;
    if (cmd.per_customer_limit !== undefined) coupon.perCustomerLimit = cmd.per_customer_limit;
    if (cmd.first_order_only !== undefined) coupon.firstOrderOnly = cmd.first_order_only;
    if (cmd.is_active !== undefined) coupon.isActive = cmd.is_active;
    return this.coupons.save(coupon);
  }

  async remove(id: string): Promise<void> {
    const res = await this.coupons.softDelete({ id });
    if (!res.affected) throw this.notFound(id);
  }

  async getById(id: string): Promise<CouponOrmEntity> {
    const coupon = await this.coupons.findOne({ where: { id } });
    if (!coupon) throw this.notFound(id);
    return coupon;
  }

  /** Coupon detail in contract shape — what the admin editor loads. */
  async getDetail(id: string, now: Date = new Date()): Promise<CouponDetailView> {
    return this.toDetailView(await this.getById(id), now);
  }

  /** Map an ORM row to the contract detail shape (snake_case + derived status). */
  toDetailView(coupon: CouponOrmEntity, now: Date = new Date()): CouponDetailView {
    return {
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discount_type: coupon.discountType,
      value: coupon.value,
      max_discount_amount: coupon.maxDiscountAmount,
      min_order_subtotal: coupon.minOrderSubtotal,
      eligibility_scope: coupon.eligibilityScope,
      eligible_category_ids: coupon.eligibleCategoryIds,
      eligible_product_ids: coupon.eligibleProductIds,
      starts_at: coupon.startsAt,
      ends_at: coupon.endsAt,
      total_used: coupon.totalUsed,
      total_usage_limit: coupon.totalUsageLimit,
      per_customer_limit: coupon.perCustomerLimit,
      first_order_only: coupon.firstOrderOnly,
      is_active: coupon.isActive,
      status: this.statusOf(coupon, now),
    };
  }

  async list(filter: {
    page: number;
    limit: number;
    status?: CouponStatus;
    q?: string;
    now?: Date;
  }): Promise<Paginated<CouponListRow>> {
    const now = filter.now ?? new Date();
    const qb = this.coupons.createQueryBuilder('c');
    if (filter.q) qb.andWhere('c.code ILIKE :q', { q: `%${filter.q.toUpperCase()}%` });

    // Status is derived, so filter in memory after fetching the matching code set (catalog is small).
    const all = await qb.orderBy('c.created_at', 'DESC').getMany();
    const withStatus = all.map((c) => ({ coupon: c, status: this.statusOf(c, now) }));
    const filtered = filter.status
      ? withStatus.filter((x) => x.status === filter.status)
      : withStatus;

    const total = filtered.length;
    const pageRows = filtered.slice((filter.page - 1) * filter.limit, filter.page * filter.limit);
    const items: CouponListRow[] = pageRows.map(({ coupon, status }) => ({
      id: coupon.id,
      code: coupon.code,
      discount_type: coupon.discountType,
      value: coupon.value,
      starts_at: coupon.startsAt,
      ends_at: coupon.endsAt,
      total_used: coupon.totalUsed,
      total_usage_limit: coupon.totalUsageLimit,
      is_active: coupon.isActive,
      status,
    }));
    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
  }

  async redemptionsView(
    id: string,
    filter: { page: number; limit: number; status?: RedemptionStatus },
  ): Promise<RedemptionsView> {
    const coupon = await this.getById(id);
    const qb = this.redemptions.createQueryBuilder('r').where('r.coupon_id = :id', { id });
    if (filter.status) qb.andWhere('r.status = :status', { status: filter.status });

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('r.created_at', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getMany();

    const remaining =
      coupon.totalUsageLimit === null ? null : Math.max(0, coupon.totalUsageLimit - coupon.totalUsed);

    return {
      summary: {
        total_used: coupon.totalUsed,
        total_usage_limit: coupon.totalUsageLimit,
        remaining,
      },
      redemptions: rows.map((r) => ({
        id: r.id,
        order_id: r.orderId,
        customer_id: r.customerId,
        discount_amount: r.discountAmount,
        status: r.status,
        created_at: r.createdAt,
      })),
      meta: { page: filter.page, limit: filter.limit, total },
    };
  }

  // --- helpers ---

  private statusOf(c: CouponOrmEntity, now: Date): CouponStatus {
    return deriveStatus(
      {
        isActive: c.isActive,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        totalUsed: c.totalUsed,
        totalUsageLimit: c.totalUsageLimit,
      },
      now,
    );
  }

  private normalizeCode(code: string): string {
    const normalized = (code ?? '').trim().toUpperCase();
    if (normalized === '') {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'code is required.' });
    }
    return normalized;
  }

  private async assertCodeFree(code: string, excludeId: string | null): Promise<void> {
    const existing = await this.coupons.findOne({ where: { code } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException({
        code: 'COUPON_CODE_EXISTS',
        message: `Coupon code "${code}" already exists.`,
      });
    }
  }

  private assertWindow(startsRaw: string, endsRaw: string): [Date, Date] {
    const startsAt = new Date(startsRaw);
    const endsAt = new Date(endsRaw);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException({ code: 'INVALID_WINDOW', message: 'starts_at/ends_at must be valid dates.' });
    }
    if (endsAt <= startsAt) {
      throw new BadRequestException({ code: 'INVALID_WINDOW', message: 'ends_at must be after starts_at.' });
    }
    return [startsAt, endsAt];
  }

  private assertValue(type: DiscountType, value?: string): void {
    if (type === DiscountType.FREE_SHIPPING) return; // value ignored
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
      throw new BadRequestException({ code: 'INVALID_VALUE', message: 'value must be a non-negative number.' });
    }
    if (type === DiscountType.PERCENTAGE && (num <= 0 || num > 100)) {
      throw new BadRequestException({
        code: 'INVALID_VALUE',
        message: 'percentage value must be between 0 and 100.',
      });
    }
  }

  private assertScope(scope: EligibilityScope, categoryIds: string[], productIds: string[]): void {
    if (scope === EligibilityScope.ALL) return;
    if (categoryIds.length === 0 && productIds.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_SCOPE',
        message: 'include/exclude scope requires at least one category or product target.',
      });
    }
  }

  private async hasRedemptions(couponId: string): Promise<boolean> {
    return (await this.redemptions.count({ where: { couponId } })) > 0;
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException({ code: 'COUPON_NOT_FOUND', message: `Coupon ${id} not found.` });
  }
}
