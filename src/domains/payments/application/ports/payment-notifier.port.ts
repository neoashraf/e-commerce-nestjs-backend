import { Injectable, Logger } from '@nestjs/common';

/** Payment notification events (FR-PAY-054). */
export type PaymentNotificationEvent =
  | 'payment.received'
  | 'payment.cancellation_refund'
  | 'payment.difference_paid';

/**
 * Outbound port to NOTIF for payment notifications (FR-PAY-054). Real impl = notif-dispatch-be. Fired on
 * payment-received, cancellation-refund, and difference-paid. {@link StubPaymentNotifier} logs only.
 */
export interface IPaymentNotifier {
  notify(event: PaymentNotificationEvent, ctx: Record<string, unknown>): Promise<void>;
}

export const PAYMENT_NOTIFIER = Symbol('IPaymentNotifier');

@Injectable()
export class StubPaymentNotifier implements IPaymentNotifier {
  private readonly logger = new Logger(StubPaymentNotifier.name);

  async notify(event: PaymentNotificationEvent, ctx: Record<string, unknown>): Promise<void> {
    this.logger.log(`[stub] NOTIF ${event} ${JSON.stringify(ctx)}`);
  }
}
