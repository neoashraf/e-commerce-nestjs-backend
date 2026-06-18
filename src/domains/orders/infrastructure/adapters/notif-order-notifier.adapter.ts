import { Injectable, Logger } from '@nestjs/common';

import { AdminNotificationService } from '../../../notifications/admin-notification.service';
import {
  IOrderNotifier,
  OrderNotificationContext,
  OrderNotificationEvent,
} from '../../application/ports/order-notifier.port';

/**
 * Real {@link IOrderNotifier} (replaces StubOrderNotifier as `ORDER_NOTIFIER`). On `order.placed` it
 * raises the in-app admin alert via NOTIF (FR-ORD-050a → FR-NOTIF-070): admins with order access get
 * a real-time bell + sound. Customer-facing SMS/email order dispatch is a separate seam, not wired here.
 *
 * Best-effort by contract (BR-ORD-12): notification failures are caught and logged so order placement
 * always commits regardless of NOTIF health — NOTIF retries/delivery are decoupled.
 */
@Injectable()
export class NotifOrderNotifier implements IOrderNotifier {
  private readonly logger = new Logger(NotifOrderNotifier.name);

  constructor(private readonly adminNotifications: AdminNotificationService) {}

  async notify(event: OrderNotificationEvent, ctx: OrderNotificationContext): Promise<void> {
    try {
      if (event === 'order.placed') {
        const orderId = typeof ctx.orderId === 'string' ? ctx.orderId : '';
        if (!orderId) {
          this.logger.warn(`order.placed for ${ctx.orderNo} had no orderId — skipped in-app alert.`);
          return;
        }
        await this.adminNotifications.emitOrderPlaced({
          orderId,
          orderNo: ctx.orderNo,
          grandTotal: typeof ctx.grandTotal === 'string' ? ctx.grandTotal : String(ctx.grandTotal ?? '0.00'),
          itemCount: typeof ctx.itemCount === 'number' ? ctx.itemCount : Number(ctx.itemCount ?? 0),
          customerName: typeof ctx.customerName === 'string' ? ctx.customerName : 'Customer',
          paymentMethod: typeof ctx.paymentMethod === 'string' ? ctx.paymentMethod : '',
        });
        return;
      }
      // Other lifecycle events (confirmed, payment_received, shipped, …) carry no in-app alert in v1;
      // the customer SMS/email dispatch seam is wired separately. Log for traceability.
      this.logger.log(`NOTIF ${event} for order ${ctx.orderNo} (no in-app alert configured).`);
    } catch (err) {
      // Decoupled (BR-ORD-12): never let a notification failure break order placement/transitions.
      this.logger.error(
        `Failed to raise NOTIF ${event} for order ${ctx.orderNo}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
