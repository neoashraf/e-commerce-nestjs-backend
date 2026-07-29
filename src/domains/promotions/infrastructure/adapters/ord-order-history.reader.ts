import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderStatus } from '../../../orders/domain/order-enums';
import { OrderOrmEntity } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import {
  CouponIdentity,
  IOrderHistoryReader,
} from '../../application/ports/order-history-reader.port';

/**
 * Real `OrderHistoryReader` (FR-PROMO-007, BR-PROMO-9) — reads ORD's `orders` table (read-only) to
 * answer "has this shopper ordered before?" for the first-order-only check.
 *
 * Replaces `StubOrderHistoryReader`, which always answered "no prior order": that made every
 * `first_order_only` coupon usable by returning customers, exactly the case FR-PROMO-007 exists to
 * block.
 */
@Injectable()
export class OrdOrderHistoryReader implements IOrderHistoryReader {
  /**
   * Statuses that do NOT count as a prior order: `pending_payment` never completed (it auto-cancels
   * when the payment window lapses, FR-ORD-012) and `cancelled` was undone. Everything else —
   * including `refunded` and the exchange states — means the shopper has ordered before.
   */
  private static readonly NOT_A_PRIOR_ORDER: OrderStatus[] = [
    OrderStatus.PENDING_PAYMENT,
    OrderStatus.CANCELLED,
  ];

  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  async hasPriorCompletedOrder(
    identity: CouponIdentity,
    excludeOrderId?: string | null,
  ): Promise<boolean> {
    const customerId = identity.customer_id ?? null;
    const guestPhone = identity.guest_phone ?? null;
    // No identity at all — an anonymous cart cannot have a history to check.
    if (!customerId && !guestPhone) return false;

    const qb = this.orders.createQueryBuilder('o').where('o.status NOT IN (:...excluded)', {
      excluded: OrdOrderHistoryReader.NOT_A_PRIOR_ORDER,
    });

    // The order currently being placed is not part of its own history: checkout creates the order
    // first and redeems the coupon after, and a COD order starts at `confirmed` (BR-ORD-3), so it
    // would otherwise read as a prior order and kill every first-order-only coupon.
    if (excludeOrderId) {
      qb.andWhere('o.id != :excludeOrderId', { excludeOrderId });
    }

    // Match on whichever identity is present. Both are checked when both are known: orders placed
    // before the OTP-gated checkout carry only `guest_phone` (customer_id null), so a customer whose
    // history is entirely pre-gate would otherwise read as a first-time buyer.
    if (customerId && guestPhone) {
      qb.andWhere('(o.customerId = :customerId OR o.guestPhone = :guestPhone)', {
        customerId,
        guestPhone,
      });
    } else if (customerId) {
      qb.andWhere('o.customerId = :customerId', { customerId });
    } else {
      qb.andWhere('o.guestPhone = :guestPhone', { guestPhone });
    }

    // Existence only — never load the rows.
    return qb.getExists();
  }
}
