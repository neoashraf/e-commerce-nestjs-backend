import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  OrderActorType,
  OrderDeliveryZone,
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import {
  OrderAddressSnapshot,
  OrderOrmEntity,
} from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import {
  IStockCoordinator,
  STOCK_COORDINATOR,
} from '../ports/stock-coordinator.port';
import {
  IOrderNotifier,
  ORDER_NOTIFIER,
} from '../ports/order-notifier.port';
import { OrderNumberingService } from './order-numbering.service';

/** A line of the placed checkout, snapshotted onto the order (CART `OrderPlacer` input). */
export interface PlaceOrderLine {
  product_id: string;
  variant_id: string;
  product_title: string;
  sku_code: string;
  variant_options?: Record<string, string>;
  unit_price: string;
  quantity: number;
  line_total: string;
}

/** The full placed-checkout snapshot CART hands to the order core (FR-ORD-001). */
export interface PlaceOrderSnapshot {
  customer_id?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  guest_email?: string | null;
  payment_method: OrderPaymentMethod;
  delivery_zone: OrderDeliveryZone;
  address: OrderAddressSnapshot;
  items: PlaceOrderLine[];
  amounts: {
    subtotal: string;
    discount_amount?: string;
    delivery_charge?: string;
    cod_surcharge?: string;
    vat_amount?: string;
    grand_total: string;
  };
  applied_coupon_code?: string | null;
  /** Idempotency key from CART so a replayed placement returns the same order (BR-CART-7). */
  idempotency_key?: string | null;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
}

/**
 * Order creation core — the real `OrderPlacer` CART calls at `/checkout/place` (FR-ORD-001–005). Accepts
 * the placed-checkout snapshot, snapshots items/prices/address/amounts/coupon immutably (BR-ORD-1),
 * allocates an `SO-` order number (BR-ORD-2), associates the customer (or the AUTH lightweight account,
 * FR-ORD-003), sets the initial status by method (`pending_payment` online / `confirmed` COD, BR-ORD-3),
 * and writes the creation history entry — all in one transaction. COD orders decrement stock + notify
 * on creation; online orders wait for the `paid` payment-state to confirm.
 */
@Injectable()
export class OrderCreationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly numbering: OrderNumberingService,
    @Inject(STOCK_COORDINATOR) private readonly stock: IStockCoordinator,
    @Inject(ORDER_NOTIFIER) private readonly notifier: IOrderNotifier,
  ) {}

  // ---------------------------------------------------------------------------
  // Place (OrderPlacer impl) — FR-ORD-001–004
  // ---------------------------------------------------------------------------

  async place(snapshot: PlaceOrderSnapshot, now: Date = new Date()): Promise<PlaceOrderResult> {
    const isCod = snapshot.payment_method === OrderPaymentMethod.COD;

    const created = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(OrderOrmEntity);

      // Idempotent placement: a replay with the same idempotency key returns the existing order.
      if (snapshot.idempotency_key) {
        const existing = await orderRepo.findOne({
          where: { idempotencyKey: snapshot.idempotency_key },
        });
        if (existing) {
          return { order: existing, replay: true };
        }
      }

      const orderNo = await this.numbering.next(manager);
      const initialStatus = isCod ? OrderStatus.CONFIRMED : OrderStatus.PENDING_PAYMENT;
      const paymentState = isCod ? OrderPaymentState.COD_PENDING : OrderPaymentState.UNPAID;

      const order = orderRepo.create({
        orderNo,
        customerId: snapshot.customer_id ?? null,
        guestName: snapshot.guest_name ?? null,
        guestPhone: snapshot.guest_phone ?? null,
        guestEmail: snapshot.guest_email ?? null,
        status: initialStatus,
        replacementOrderId: null,
        paymentMethod: snapshot.payment_method,
        paymentState,
        deliveryZone: snapshot.delivery_zone,
        addressSnapshot: snapshot.address,
        subtotal: this.money(snapshot.amounts.subtotal),
        discountAmount: this.money(snapshot.amounts.discount_amount),
        appliedCouponCode: snapshot.applied_coupon_code ?? null,
        deliveryCharge: this.money(snapshot.amounts.delivery_charge),
        codSurcharge: this.money(snapshot.amounts.cod_surcharge),
        vatAmount: this.money(snapshot.amounts.vat_amount),
        grandTotal: this.money(snapshot.amounts.grand_total),
        idempotencyKey: snapshot.idempotency_key ?? null,
        placedAt: now,
      } as Partial<OrderOrmEntity>);
      const saved = await orderRepo.save(order);

      const itemRepo = manager.getRepository(OrderItemOrmEntity);
      for (const line of snapshot.items) {
        await itemRepo.save(
          itemRepo.create({
            orderId: saved.id,
            productId: line.product_id,
            variantId: line.variant_id,
            productTitle: line.product_title,
            skuCode: line.sku_code,
            variantOptions: line.variant_options ?? {},
            unitPrice: this.money(line.unit_price),
            quantity: line.quantity,
            lineTotal: this.money(line.line_total),
          }),
        );
      }

      await this.appendHistory(manager, saved.id, null, initialStatus, OrderActorType.SYSTEM, null, now);
      return { order: saved, replay: false };
    });

    if (created.replay) {
      return {
        orderId: created.order.id,
        orderNo: created.order.orderNo,
        status: created.order.status,
      };
    }

    // Side effects after the order commits (idempotent; safe to run post-transaction). The in-app
    // admin alert (FR-ORD-050a) needs the item count, which lives on the placement snapshot.
    const itemCount = snapshot.items.reduce((sum, line) => sum + line.quantity, 0);
    await this.notifier.notify('order.placed', { ...this.ctx(created.order), itemCount });
    if (isCod) {
      // COD confirms immediately → decrement stock + confirmation notice (FR-ORD-030/050).
      await this.stock.decrement(created.order.id);
      await this.notifier.notify('order.confirmed', this.ctx(created.order));
    }

    return {
      orderId: created.order.id,
      orderNo: created.order.orderNo,
      status: created.order.status,
    };
  }

  // ---------------------------------------------------------------------------
  // Payment-state reflection — FR-ORD-010–013 (OrderGateway target for PAY)
  // ---------------------------------------------------------------------------

  async reflectPaymentState(
    orderNo: string,
    paymentState: OrderPaymentState,
    now: Date = new Date(),
  ): Promise<{ order_no: string; status: OrderStatus }> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(OrderOrmEntity);
      const order = await orderRepo.findOne({ where: { orderNo } });
      if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });

      let confirmedNow = false;
      let refundedNow = false;

      if (paymentState === OrderPaymentState.PAID) {
        // Advance pending_payment → confirmed on the first paid signal (idempotent: a replay of
        // `paid` on an already-confirmed order changes nothing, FR-ORD-010).
        if (order.status === OrderStatus.PENDING_PAYMENT) {
          await this.appendHistory(
            manager,
            order.id,
            order.status,
            OrderStatus.CONFIRMED,
            OrderActorType.SYSTEM,
            'Payment received',
            now,
          );
          order.status = OrderStatus.CONFIRMED;
          confirmedNow = true;
        }
        order.paymentState = OrderPaymentState.PAID;
      } else if (paymentState === OrderPaymentState.REFUNDED) {
        // PAY confirmed a refund. A prepaid cancellation refund advances `cancelled → refunded`
        // (FR-ORD-042, §12.10); on any other status just mirror the payment state. Idempotent: a
        // replay on an already-`refunded` order changes nothing.
        order.paymentState = OrderPaymentState.REFUNDED;
        if (order.status === OrderStatus.CANCELLED) {
          await this.appendHistory(
            manager,
            order.id,
            order.status,
            OrderStatus.REFUNDED,
            OrderActorType.SYSTEM,
            'Cancellation refund confirmed',
            now,
          );
          order.status = OrderStatus.REFUNDED;
          refundedNow = true;
        }
      } else if (
        paymentState === OrderPaymentState.COD_COLLECTED ||
        paymentState === OrderPaymentState.PARTIALLY_REFUNDED ||
        paymentState === OrderPaymentState.COD_PENDING
      ) {
        // Record the payment-state mirror (COD collection, partial refund) without changing the
        // fulfilment status here (FR-ORD-013) — fulfilment transitions are owned by the admin slice.
        order.paymentState = paymentState;
      } else {
        // unpaid (failure/cancellation): keep pending_payment for retry (FR-ORD-011).
        order.paymentState = OrderPaymentState.UNPAID;
      }

      await orderRepo.save(order);
      return { order, confirmedNow, refundedNow };
    });

    if (outcome.confirmedNow) {
      await this.stock.decrement(outcome.order.id);
      await this.notifier.notify('order.payment_received', this.ctx(outcome.order));
      await this.notifier.notify('order.confirmed', this.ctx(outcome.order));
    }
    if (outcome.refundedNow) {
      await this.notifier.notify('order.cancellation_refund', this.ctx(outcome.order));
    }

    return { order_no: outcome.order.orderNo, status: outcome.order.status };
  }

  // ---------------------------------------------------------------------------
  // Auto-cancel of an unpaid online order — FR-ORD-012 (used by the scheduled task)
  // ---------------------------------------------------------------------------

  /** Cancel an unpaid online order + release its reservation (idempotent). */
  async autoCancelUnpaid(orderId: string, now: Date = new Date()): Promise<boolean> {
    const order = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(OrderOrmEntity);
      const found = await orderRepo.findOne({ where: { id: orderId } });
      // Only cancel orders still awaiting payment (idempotent: anything else is a no-op).
      if (!found || found.status !== OrderStatus.PENDING_PAYMENT) return null;

      await this.appendHistory(
        manager,
        found.id,
        found.status,
        OrderStatus.CANCELLED,
        OrderActorType.SYSTEM,
        'Auto-cancelled: payment not completed',
        now,
      );
      found.status = OrderStatus.CANCELLED;
      await orderRepo.save(found);
      return found;
    });

    if (!order) return false;
    await this.stock.release(order.id);
    await this.notifier.notify('order.cancelled', this.ctx(order));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async appendHistory(
    manager: EntityManager,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorType: OrderActorType,
    note: string | null,
    now: Date,
  ): Promise<void> {
    const repo = manager.getRepository(OrderStatusHistoryOrmEntity);
    await repo.save(
      repo.create({
        orderId,
        fromStatus,
        toStatus,
        actorType,
        actorId: null,
        note,
        createdAt: now,
      }),
    );
  }

  private ctx(order: OrderOrmEntity) {
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customerId: order.customerId,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
      grandTotal: order.grandTotal,
      paymentMethod: order.paymentMethod,
      // Display name for the in-app admin alert: guest name, else the delivery recipient (FR-ORD-050a).
      customerName: order.guestName ?? order.addressSnapshot?.recipient_name ?? 'Customer',
    };
  }

  private money(value?: string | null): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }
}
