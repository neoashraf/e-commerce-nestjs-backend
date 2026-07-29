import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { DiscountType, EligibilityScope, RedemptionStatus } from '../../domain/promo-enums';
import { CouponOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';
import { CartLine, computeEligibleSubtotalPaisa } from '../eligibility';
import { clampPaisa, fromPaisa, percentOfPaisa } from '../money';
import {
  CouponIdentity,
  IOrderHistoryReader,
  ORDER_HISTORY_READER,
} from '../ports/order-history-reader.port';

/** Verdict reasons returned by validate (contract reason enum, FR-PROMO-010). */
export type InvalidReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'min_order_not_met'
  | 'usage_limit_reached'
  | 'per_customer_limit_reached'
  | 'not_eligible_items'
  | 'first_order_only';

export interface ValidateCommand {
  code: string;
  identity: CouponIdentity;
  cart: { lines: CartLine[]; subtotal: string };
}

export type ValidateResult =
  | {
      valid: true;
      coupon: { code: string; discount_type: DiscountType };
      eligible_subtotal: string;
      discount_amount: string;
      free_shipping: boolean;
    }
  | { valid: false; reason: InvalidReason; message: string };

export interface RedeemCommand {
  code: string;
  order_id: string;
  identity: CouponIdentity;
  discount_amount: string;
}

export interface RedeemResult {
  redeemed: true;
  redemption_id: string;
  already_applied?: true;
}

export interface ReverseResult {
  reversed: true;
}

/**
 * Coupon engine (PROMO §5.2/§5.3) — the real impl behind CART's `CouponValidator` port and
 * checkout redeem, plus ORD's reversal-on-cancel. `validate` resolves a code against a cart and
 * returns a verdict + Decimal discount on the eligible subtotal, or a specific `reason`. `redeem`
 * re-validates at placement and records a redemption while incrementing total + per-customer caps
 * **atomically** (row lock + transaction, BR-PROMO-6/§12.2), idempotent per order. `reverse` frees
 * a use on cancellation (idempotent); exchanges never call it (BR-PROMO-8).
 */
@Injectable()
export class CouponEngineService {
  private readonly logger = new Logger(CouponEngineService.name);

  constructor(
    @InjectRepository(CouponOrmEntity)
    private readonly coupons: Repository<CouponOrmEntity>,
    @InjectRepository(CouponRedemptionOrmEntity)
    private readonly redemptions: Repository<CouponRedemptionOrmEntity>,
    private readonly dataSource: DataSource,
    @Inject(ORDER_HISTORY_READER)
    private readonly orderHistory: IOrderHistoryReader,
  ) {}

  // ---------------------------------------------------------------------------
  // Validate (FR-PROMO-010–014)
  // ---------------------------------------------------------------------------

  async validate(cmd: ValidateCommand, now: Date = new Date()): Promise<ValidateResult> {
    const code = this.normalizeCode(cmd.code);
    const coupon = await this.coupons.findOne({ where: { code } });
    return this.evaluate(coupon, cmd.identity, cmd.cart.lines, now);
  }

  /**
   * Shared validation core used by validate + redeem re-validation. Returns a valid verdict with
   * the computed discount, or an invalid verdict with a specific reason. Counts checked here are
   * advisory at validate time; redeem enforces caps atomically.
   */
  private async evaluate(
    coupon: CouponOrmEntity | null,
    identity: CouponIdentity,
    lines: CartLine[],
    now: Date,
    perCustomerUsed?: number,
  ): Promise<ValidateResult> {
    if (!coupon) return this.invalid('not_found', 'Coupon code not found.');
    if (!coupon.isActive) return this.invalid('inactive', 'This coupon is no longer active.');
    if (now < coupon.startsAt) return this.invalid('not_started', 'This coupon is not active yet.');
    if (now > coupon.endsAt) return this.invalid('expired', 'This coupon has expired.');

    // Total usage cap (advisory here, atomic at redeem).
    if (coupon.totalUsageLimit !== null && coupon.totalUsed >= coupon.totalUsageLimit) {
      return this.invalid('usage_limit_reached', 'This coupon has reached its usage limit.');
    }

    // Per-customer cap (advisory; redeem enforces atomically).
    if (coupon.perCustomerLimit !== null) {
      const used = perCustomerUsed ?? (await this.perCustomerUsed(coupon.id, identity));
      if (used >= coupon.perCustomerLimit) {
        return this.invalid(
          'per_customer_limit_reached',
          'You have already used this coupon the maximum number of times.',
        );
      }
    }

    // First-order-only.
    if (coupon.firstOrderOnly) {
      const hasPrior = await this.orderHistory.hasPriorCompletedOrder(identity);
      if (hasPrior) {
        return this.invalid('first_order_only', 'This coupon is valid on a first order only.');
      }
    }

    // Eligible subtotal per scope.
    const eligiblePaisa = computeEligibleSubtotalPaisa(
      lines,
      coupon.eligibilityScope as EligibilityScope,
      coupon.eligibleCategoryIds,
      coupon.eligibleProductIds,
    );
    if (eligiblePaisa <= 0) {
      return this.invalid('not_eligible_items', 'No eligible items for this coupon.');
    }

    // Minimum order subtotal — measured against the eligible subtotal.
    if (coupon.minOrderSubtotal !== null) {
      const minPaisa = Math.round(Number(coupon.minOrderSubtotal) * 100);
      if (eligiblePaisa < minPaisa) {
        return this.invalid(
          'min_order_not_met',
          `Minimum order ৳${coupon.minOrderSubtotal} required.`,
        );
      }
    }

    // Compute discount on the eligible subtotal.
    const discountType = coupon.discountType as DiscountType;
    let discountPaisa = 0;
    let freeShipping = false;

    if (discountType === DiscountType.FREE_SHIPPING) {
      freeShipping = true; // CART waives the delivery charge; no subtotal discount (FR-PROMO-013).
    } else if (discountType === DiscountType.PERCENTAGE) {
      discountPaisa = percentOfPaisa(eligiblePaisa, Number(coupon.value));
      if (coupon.maxDiscountAmount !== null) {
        const capPaisa = Math.round(Number(coupon.maxDiscountAmount) * 100);
        discountPaisa = Math.min(discountPaisa, capPaisa);
      }
    } else {
      // fixed
      discountPaisa = Math.round(Number(coupon.value) * 100);
    }

    // Never exceed the eligible subtotal (BR-PROMO-4, §12.9).
    discountPaisa = clampPaisa(discountPaisa, eligiblePaisa);

    return {
      valid: true,
      coupon: { code: coupon.code, discount_type: discountType },
      eligible_subtotal: fromPaisa(eligiblePaisa),
      discount_amount: fromPaisa(discountPaisa),
      free_shipping: freeShipping,
    };
  }

  // ---------------------------------------------------------------------------
  // Redeem (FR-PROMO-015/020/021/023/024)
  // ---------------------------------------------------------------------------

  async redeem(cmd: RedeemCommand, now: Date = new Date()): Promise<RedeemResult> {
    const code = this.normalizeCode(cmd.code);

    return this.dataSource.transaction(async (manager) => {
      const couponRepo = manager.getRepository(CouponOrmEntity);
      const redemptionRepo = manager.getRepository(CouponRedemptionOrmEntity);

      // Idempotency: an existing applied redemption for this order is returned as-is (FR-PROMO-023).
      const existing = await redemptionRepo.findOne({
        where: { orderId: cmd.order_id, status: RedemptionStatus.APPLIED },
      });
      if (existing) {
        return { redeemed: true as const, redemption_id: existing.id, already_applied: true as const };
      }

      // Lock the coupon row so concurrent placements serialize on the cap check (BR-PROMO-6, §12.2).
      const coupon = await couponRepo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.code = :code', { code })
        .getOne();

      // Re-validate at placement (windows/active state may have changed, FR-PROMO-015).
      const perCustomerUsed = coupon ? await this.perCustomerUsed(coupon.id, cmd.identity, manager) : 0;
      const verdict = await this.evaluate(coupon, cmd.identity, [], now, perCustomerUsed);
      // The verdict above is computed without cart lines, so it skips item-eligibility; re-check
      // only the time/cap/first-order conditions here. Discount recompute is CART's job at validate.
      if (!coupon) {
        throw new ConflictException({ code: 'COUPON_INVALID', reason: 'not_found' });
      }
      if (!coupon.isActive) throw new ConflictException({ code: 'COUPON_INVALID', reason: 'inactive' });
      if (now < coupon.startsAt) {
        throw new ConflictException({ code: 'COUPON_INVALID', reason: 'not_started' });
      }
      if (now > coupon.endsAt) throw new ConflictException({ code: 'COUPON_INVALID', reason: 'expired' });

      // Atomic total cap.
      if (coupon.totalUsageLimit !== null && coupon.totalUsed >= coupon.totalUsageLimit) {
        throw new ConflictException({ code: 'USAGE_LIMIT_REACHED' });
      }
      // Atomic per-customer cap.
      if (coupon.perCustomerLimit !== null && perCustomerUsed >= coupon.perCustomerLimit) {
        throw new ConflictException({ code: 'PER_CUSTOMER_LIMIT_REACHED' });
      }
      // First-order-only re-check — excluding the order this redeem belongs to. CART creates the
      // order BEFORE calling redeem and a COD order is born `confirmed`, so counting it would make
      // a genuine first order look like a repeat one (FR-PROMO-024, BR-PROMO-9).
      if (
        coupon.firstOrderOnly &&
        (await this.orderHistory.hasPriorCompletedOrder(cmd.identity, cmd.order_id))
      ) {
        throw new ConflictException({ code: 'COUPON_INVALID', reason: 'first_order_only' });
      }
      void verdict; // verdict reserved for future cart re-eval; cap/time checks are authoritative here.

      // Record the ledger entry + increment the running total atomically.
      const redemption = await redemptionRepo.save(
        redemptionRepo.create({
          couponId: coupon.id,
          orderId: cmd.order_id,
          customerId: cmd.identity.customer_id ?? null,
          guestPhone: cmd.identity.guest_phone ?? null,
          discountAmount: this.normalizeAmount(cmd.discount_amount),
          status: RedemptionStatus.APPLIED,
        }),
      );
      coupon.totalUsed += 1;
      await couponRepo.save(coupon);

      return { redeemed: true as const, redemption_id: redemption.id };
    });
  }

  // ---------------------------------------------------------------------------
  // Reverse (FR-PROMO-022/023)
  // ---------------------------------------------------------------------------

  async reverse(orderId: string, now: Date = new Date()): Promise<ReverseResult> {
    return this.dataSource.transaction(async (manager) => {
      const couponRepo = manager.getRepository(CouponOrmEntity);
      const redemptionRepo = manager.getRepository(CouponRedemptionOrmEntity);

      const applied = await redemptionRepo.findOne({
        where: { orderId, status: RedemptionStatus.APPLIED },
      });
      // Idempotent: no applied redemption (already reversed / never redeemed) → no-op success.
      if (!applied) return { reversed: true as const };

      const coupon = await couponRepo
        .createQueryBuilder('c')
        .setLock('pessimistic_write')
        .where('c.id = :id', { id: applied.couponId })
        .getOne();

      applied.status = RedemptionStatus.REVERSED;
      applied.reversedAt = now;
      await redemptionRepo.save(applied);

      if (coupon) {
        coupon.totalUsed = Math.max(0, coupon.totalUsed - 1);
        await couponRepo.save(coupon);
      }

      return { reversed: true as const };
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Count a customer/guest's APPLIED redemptions of a coupon (per-customer cap key, BR-PROMO-7). */
  private async perCustomerUsed(
    couponId: string,
    identity: CouponIdentity,
    manager?: EntityManager,
  ): Promise<number> {
    const repo = manager
      ? manager.getRepository(CouponRedemptionOrmEntity)
      : this.redemptions;
    if (identity.customer_id) {
      return repo.count({
        where: { couponId, customerId: identity.customer_id, status: RedemptionStatus.APPLIED },
      });
    }
    if (identity.guest_phone) {
      return repo.count({
        where: { couponId, guestPhone: identity.guest_phone, status: RedemptionStatus.APPLIED },
      });
    }
    return 0;
  }

  private invalid(reason: InvalidReason, message: string): ValidateResult {
    return { valid: false, reason, message };
  }

  private normalizeCode(code: string): string {
    return (code ?? '').trim().toUpperCase();
  }

  private normalizeAmount(amount: string): string {
    const n = Number(amount);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }
}
