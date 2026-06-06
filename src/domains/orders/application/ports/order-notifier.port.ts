import { Injectable, Logger } from '@nestjs/common';

/** Order notification event kinds (FR-ORD-050). */
export type OrderNotificationEvent =
  | 'order.placed'
  | 'order.confirmed'
  | 'order.payment_received'
  | 'order.payment_reminder'
  | 'order.cancelled'
  | 'order.cancellation_refund'
  | 'order.shipped'
  | 'order.out_for_delivery'
  | 'order.delivered'
  | 'order.exchange_requested'
  | 'order.exchange_approved'
  | 'order.exchange_replacement_dispatched'
  | 'order.exchange_rejected';

export interface OrderNotificationContext {
  orderNo: string;
  customerId?: string | null;
  guestPhone?: string | null;
  guestEmail?: string | null;
  [key: string]: unknown;
}

/**
 * Outbound port to NOTIF for order lifecycle notifications (FR-ORD-050). Real impl = notif-dispatch-be.
 * The order core emits placement / confirmation / payment-received / payment-reminder events; the
 * fulfilment + exchange slices emit the rest through this same port. {@link StubOrderNotifier} logs only.
 */
export interface IOrderNotifier {
  notify(event: OrderNotificationEvent, ctx: OrderNotificationContext): Promise<void>;
}

export const ORDER_NOTIFIER = Symbol('IOrderNotifier');

/** Default logging stub for the NOTIF seam until notif-dispatch-be is wired in-process. */
@Injectable()
export class StubOrderNotifier implements IOrderNotifier {
  private readonly logger = new Logger(StubOrderNotifier.name);

  async notify(event: OrderNotificationEvent, ctx: OrderNotificationContext): Promise<void> {
    this.logger.log(`[stub] NOTIF ${event} for order ${ctx.orderNo}`);
  }
}
