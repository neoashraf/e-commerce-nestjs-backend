import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderPaymentState, OrderStatus } from '../../../orders/domain/order-enums';
import { OrderOrmEntity } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { IOrderGateway, OrderForPayment } from '../../application/ports/order-gateway.port';

/**
 * Real ORD↔PAY gateway (replaces StubOrderGateway, which returned a hardcoded 0.00 total). Reads the
 * live order grand total + state from the `orders` table so PAY initiates the payment for the correct
 * amount, and reflects outcomes back: a successful online capture advances `pending_payment → confirmed`
 * and `payment_state → paid`; a failure leaves the order pending for retry (FR-PAY-042, BR-PAY-9).
 */
@Injectable()
export class OrdOrderGateway implements IOrderGateway {
  private readonly logger = new Logger(OrdOrderGateway.name);

  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  async getOrder(orderId: string): Promise<OrderForPayment | null> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) return null;
    return {
      orderId: order.id,
      orderNo: order.orderNo,
      grandTotal: order.grandTotal,
      isPendingPayment: order.status === OrderStatus.PENDING_PAYMENT,
    };
  }

  async markOrderPaid(orderId: string, paymentId: string): Promise<void> {
    // Advance only a still-pending order; a paid callback for an already-advanced order is a no-op.
    await this.orders.update(
      { id: orderId, status: OrderStatus.PENDING_PAYMENT },
      { status: OrderStatus.CONFIRMED, paymentState: OrderPaymentState.PAID },
    );
    this.logger.log(`Order ${orderId} marked paid (payment ${paymentId}).`);
  }

  async markOrderPaymentFailed(orderId: string): Promise<void> {
    // Leave the order pending_payment so the customer can retry (FR-PAY-042). No state change.
    this.logger.log(`Order ${orderId} payment failed; left pending for retry.`);
  }
}
