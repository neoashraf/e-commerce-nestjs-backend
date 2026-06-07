import { Injectable, Logger } from '@nestjs/common';

/** Minimal order view PAY needs to validate amounts + state before initiating (FR-PAY-005). */
export interface OrderForPayment {
  orderId: string;
  orderNo: string;
  grandTotal: string;
  /** Whether the order is currently awaiting payment (only then may a payment be initiated). */
  isPendingPayment: boolean;
}

/**
 * Outbound port to ORD (FR-PAY-042, BR-PAY-9). PAY reads the order grand total + state and propagates
 * payment outcomes back: `markOrderPaid` advances `pending_payment → confirmed`; `markOrderPaymentFailed`
 * leaves it `pending_payment` for retry. The real impl wraps ORD's payment-state reflection in the same
 * transaction as the payment status change. {@link StubOrderGateway} returns a fixed order + logs.
 */
export interface IOrderGateway {
  getOrder(orderId: string): Promise<OrderForPayment | null>;
  markOrderPaid(orderId: string, paymentId: string): Promise<void>;
  markOrderPaymentFailed(orderId: string): Promise<void>;
}

export const ORDER_GATEWAY = Symbol('IOrderGateway');

/**
 * Default stub for the ORD seam until ord-core-be is wired in-process. Returns a placeholder order
 * (pending, fixed total) so pay-core builds and tests stand-alone; swap for an ORD-backed adapter at
 * the BW5 CART integration step.
 */
@Injectable()
export class StubOrderGateway implements IOrderGateway {
  private readonly logger = new Logger(StubOrderGateway.name);

  async getOrder(orderId: string): Promise<OrderForPayment | null> {
    return {
      orderId,
      orderNo: `SO-${orderId.slice(0, 6)}`,
      grandTotal: '0.00',
      isPendingPayment: true,
    };
  }

  async markOrderPaid(orderId: string, paymentId: string): Promise<void> {
    this.logger.log(`[stub] ORD markOrderPaid order=${orderId} payment=${paymentId}`);
  }

  async markOrderPaymentFailed(orderId: string): Promise<void> {
    this.logger.log(`[stub] ORD markOrderPaymentFailed order=${orderId}`);
  }
}
