import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  OrderActorType,
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';
import { OrderNoteEntryDto } from '../../presentation/dto/order-note.dto';
import { OrderNotesService } from './order-notes.service';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { IOrderNotifier, ORDER_NOTIFIER } from '../ports/order-notifier.port';
import {
  IRefundRequester,
  REFUND_REQUESTER,
} from '../ports/refund-requester.port';
import {
  IStockCoordinator,
  STOCK_COORDINATOR,
} from '../ports/stock-coordinator.port';

/** The forward-only fulfilment lifecycle (FR-ORD-020/022, BR-ORD-5). A valid advance moves to the next. */
const FORWARD_LIFECYCLE: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

/** Status → NOTIF event for fulfilment advances (FR-ORD-050). */
const ADVANCE_EVENTS: Partial<Record<OrderStatus, 'order.shipped' | 'order.out_for_delivery' | 'order.delivered'>> = {
  [OrderStatus.SHIPPED]: 'order.shipped',
  [OrderStatus.OUT_FOR_DELIVERY]: 'order.out_for_delivery',
  [OrderStatus.DELIVERED]: 'order.delivered',
};

export interface AdvanceStatusInput {
  toStatus: OrderStatus;
  courierName?: string | null;
  trackingNumber?: string | null;
  note?: string | null;
  actorId: string;
}

export interface AdminCancelResult {
  status: OrderStatus;
  restocked: boolean;
  refund: { triggered: boolean };
}

export interface CustomerCancelResult {
  orderNo: string;
  status: OrderStatus;
  refund: { applicable: boolean; type?: string; note?: string };
}

/**
 * Fulfilment lifecycle + cancellation + internal notes (ord-fulfilment-be; FR-ORD-020–024, 040–042, 072).
 * Advances orders forward through the lifecycle (enforcing allowed transitions + paid-before-progress +
 * shipment fields entering `shipped`), records status history, supports customer (pre-`processing`) and
 * admin (pre-`shipped`) cancellation with idempotent restock (INV port) and a prepaid gateway refund
 * trigger (PAY port), and stores admin-only internal notes. Every mutating action takes a pessimistic
 * write lock on the order so the first valid action wins under concurrency (§12.3).
 */
@Injectable()
export class FulfilmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderNotes: OrderNotesService,
    @Inject(STOCK_COORDINATOR) private readonly stock: IStockCoordinator,
    @Inject(ORDER_NOTIFIER) private readonly notifier: IOrderNotifier,
    @Inject(REFUND_REQUESTER) private readonly refunds: IRefundRequester,
  ) {}

  // ---------------------------------------------------------------------------
  // Admin — advance status / record shipment (FR-ORD-020–024)
  // ---------------------------------------------------------------------------

  async advanceStatus(
    orderNo: string,
    input: AdvanceStatusInput,
    now: Date = new Date(),
  ): Promise<{ order_no: string; status: OrderStatus }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, orderNo);
      const from = order.status;
      const to = input.toStatus;

      // Forward-only: both endpoints must be on the lifecycle and `to` must be the immediate next.
      const fromIdx = FORWARD_LIFECYCLE.indexOf(from);
      const toIdx = FORWARD_LIFECYCLE.indexOf(to);
      if (fromIdx === -1 || toIdx !== fromIdx + 1) {
        throw new ConflictException({ code: 'INVALID_TRANSITION', from, to });
      }

      // Online orders must be `paid` to progress beyond `confirmed` (FR-ORD-024, BR-ORD-4).
      if (
        from === OrderStatus.CONFIRMED &&
        order.paymentMethod !== OrderPaymentMethod.COD &&
        order.paymentState !== OrderPaymentState.PAID
      ) {
        throw new ConflictException({
          code: 'PAYMENT_REQUIRED',
          message: 'Online order must be paid to progress.',
        });
      }

      // Shipment details are mandatory when entering `shipped` (FR-ORD-021).
      if (to === OrderStatus.SHIPPED) {
        const courier = input.courierName?.trim();
        const tracking = input.trackingNumber?.trim();
        if (!courier || !tracking) {
          throw new BadRequestException({
            code: 'BAD_REQUEST',
            message: 'courier_name and tracking_number are required to mark an order shipped.',
          });
        }
        order.courierName = courier;
        order.trackingNumber = tracking;
      }

      order.status = to;
      await manager.getRepository(OrderOrmEntity).save(order);
      await this.appendHistory(manager, order.id, from, to, OrderActorType.ADMIN, input.actorId, input.note ?? null, now);
      return order;
    });

    const event = ADVANCE_EVENTS[result.status];
    if (event) await this.notifier.notify(event, this.ctx(result));

    return { order_no: result.orderNo, status: result.status };
  }

  // ---------------------------------------------------------------------------
  // Customer cancel (pre-dispatch) — FR-ORD-040
  // ---------------------------------------------------------------------------

  async customerCancel(
    orderNo: string,
    customerId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<CustomerCancelResult> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, orderNo);
      if (order.customerId !== customerId) {
        // Don't disclose existence of another customer's order.
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
      }
      // Customer may cancel only while pending_payment or confirmed (pre-`processing`).
      if (order.status !== OrderStatus.PENDING_PAYMENT && order.status !== OrderStatus.CONFIRMED) {
        throw new ConflictException({
          code: 'NOT_CANCELLABLE',
          message: 'Order can no longer be cancelled.',
        });
      }
      return this.applyCancellation(manager, order, OrderActorType.CUSTOMER, customerId, reason, now);
    });

    await this.afterCancellation(outcome, reason);

    return {
      orderNo: outcome.order.orderNo,
      status: outcome.order.status,
      refund: outcome.prepaid
        ? { applicable: true, type: 'gateway', note: 'Prepaid amount will be refunded to source.' }
        : { applicable: false },
    };
  }

  // ---------------------------------------------------------------------------
  // Admin cancel (any pre-`shipped` state) — FR-ORD-041
  // ---------------------------------------------------------------------------

  async adminCancel(
    orderNo: string,
    adminId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<AdminCancelResult> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, orderNo);
      // Admin may cancel any pre-`shipped` state (pending_payment / confirmed / processing / packed).
      const cancellable: OrderStatus[] = [
        OrderStatus.PENDING_PAYMENT,
        OrderStatus.CONFIRMED,
        OrderStatus.PROCESSING,
        OrderStatus.PACKED,
      ];
      if (!cancellable.includes(order.status)) {
        throw new ConflictException({
          code: 'NOT_CANCELLABLE',
          message: 'Order can no longer be cancelled (already dispatched or finalised).',
        });
      }
      return this.applyCancellation(manager, order, OrderActorType.ADMIN, adminId, reason, now);
    });

    await this.afterCancellation(outcome, reason);

    return {
      status: outcome.order.status,
      restocked: true,
      refund: { triggered: outcome.prepaid },
    };
  }

  // ---------------------------------------------------------------------------
  // Internal notes — FR-ORD-072
  // ---------------------------------------------------------------------------

  async addNote(
    orderNo: string,
    body: string,
    adminId: string,
  ): Promise<{ id: string; created_at: string; entry: OrderNoteEntryDto }> {
    const { id, entry } = await this.orderNotes.addAdminNote(orderNo, body, adminId);
    return { id, created_at: entry.created_at, entry };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Re-read the order under a pessimistic write lock so the first valid action wins (§12.3). */
  private async lockOrder(manager: EntityManager, orderNo: string): Promise<OrderOrmEntity> {
    const order = await manager.getRepository(OrderOrmEntity).findOne({
      where: { orderNo },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
    return order;
  }

  /**
   * Apply the cancellation in-transaction: set `cancelled` + append history. Returns whether the order
   * was prepaid (`paid` online — so a gateway refund is owed) and whether stock was only reserved (a
   * `pending_payment` order is released, not restocked). INV/refund/notify run post-commit (idempotent)
   * in {@link afterCancellation}.
   */
  private async applyCancellation(
    manager: EntityManager,
    order: OrderOrmEntity,
    actorType: OrderActorType,
    actorId: string,
    reason: string,
    now: Date,
  ): Promise<{ order: OrderOrmEntity; prepaid: boolean; onlyReserved: boolean }> {
    const prepaid =
      order.paymentMethod !== OrderPaymentMethod.COD &&
      order.paymentState === OrderPaymentState.PAID;
    // A `pending_payment` order's stock is reserved (not yet decremented — decrement happens on
    // `confirmed`), so it is released rather than restocked (BR-ORD-6, mirrors auto-cancel).
    const onlyReserved = order.status === OrderStatus.PENDING_PAYMENT;
    const from = order.status;
    order.status = OrderStatus.CANCELLED;
    await manager.getRepository(OrderOrmEntity).save(order);
    await this.appendHistory(manager, order.id, from, OrderStatus.CANCELLED, actorType, actorId, reason, now);
    return { order, prepaid, onlyReserved };
  }

  /** Post-commit side effects of a cancellation: idempotent stock return, prepaid refund trigger, notify. */
  private async afterCancellation(
    outcome: { order: OrderOrmEntity; prepaid: boolean; onlyReserved: boolean },
    reason: string,
  ): Promise<void> {
    if (outcome.onlyReserved) {
      await this.stock.release(outcome.order.id);
    } else {
      await this.stock.restock(outcome.order.id, 'restocked');
    }
    await this.notifier.notify('order.cancelled', this.ctx(outcome.order));
    if (outcome.prepaid) {
      await this.refunds.requestCancellationRefund({
        orderId: outcome.order.id,
        orderNo: outcome.order.orderNo,
        amount: outcome.order.grandTotal,
        reason,
      });
    }
  }

  private async appendHistory(
    manager: EntityManager,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorType: OrderActorType,
    actorId: string | null,
    note: string | null,
    now: Date,
  ): Promise<void> {
    const repo = manager.getRepository(OrderStatusHistoryOrmEntity);
    await repo.save(
      repo.create({ orderId, fromStatus, toStatus, actorType, actorId, note, createdAt: now }),
    );
  }

  private ctx(order: OrderOrmEntity) {
    return {
      orderNo: order.orderNo,
      customerId: order.customerId,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
    };
  }
}
