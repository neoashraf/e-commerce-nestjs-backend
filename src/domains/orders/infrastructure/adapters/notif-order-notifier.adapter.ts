import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AdminNotificationService } from '../../../notifications/admin-notification.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationChannel } from '../../../notifications/notification.enums';
import {
  IOrderNotifier,
  OrderNotificationContext,
  OrderNotificationEvent,
} from '../../application/ports/order-notifier.port';

/**
 * Real {@link IOrderNotifier} (replaces StubOrderNotifier as `ORDER_NOTIFIER`). On `order.placed` it
 * raises the in-app admin alert via NOTIF (FR-ORD-050a → FR-NOTIF-070). On `order.payment_received`
 * (online payment confirmed `paid`) it sends the customer a transactional **payment received** email via
 * the NOTIF dispatch core (FR-ORD-050 → `payment.received`/FR-NOTIF-030/031). Remaining lifecycle events
 * still log only — their customer SMS/email dispatch can be wired the same way.
 *
 * Best-effort by contract (BR-ORD-12): notification failures are caught and logged so order placement /
 * payment reflection always commits regardless of NOTIF health — NOTIF retries/delivery are decoupled.
 */
@Injectable()
export class NotifOrderNotifier implements IOrderNotifier {
  private readonly logger = new Logger(NotifOrderNotifier.name);

  constructor(
    private readonly adminNotifications: AdminNotificationService,
    private readonly dispatch: NotificationDispatchService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

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
      if (event === 'order.payment_received') {
        // Successful online payment → email the customer their payment confirmation (FR-ORD-050).
        await this.sendPaymentReceivedEmail(ctx);
        return;
      }
      // Other lifecycle events (confirmed, shipped, …) carry no in-app alert in v1; their customer
      // SMS/email dispatch can be wired here the same way. Log for traceability.
      this.logger.log(`NOTIF ${event} for order ${ctx.orderNo} (no dispatch configured).`);
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

  /**
   * Dispatch the customer-facing `payment.received` transactional email (FR-NOTIF-030/031). Resolves the
   * recipient: a registered buyer's email + name from the AUTH `customers` table (read-only, table/column
   * names only — same decoupling as the CUST→AUTH gateway), else the guest email/name captured at checkout.
   * Skips (logs) when no email is on file — email is optional for guests. Idempotent per order so a replayed
   * `paid` signal can't double-send (the dispatch core dedups on the key within its retention window).
   */
  private async sendPaymentReceivedEmail(ctx: OrderNotificationContext): Promise<void> {
    const customerId = typeof ctx.customerId === 'string' ? ctx.customerId : null;
    let email: string | null = null;
    let name = typeof ctx.customerName === 'string' ? ctx.customerName : 'Customer';

    if (customerId) {
      const contact = await this.resolveCustomerContact(customerId);
      email = contact?.email ?? null;
      if (contact?.name) name = contact.name;
    } else {
      email = typeof ctx.guestEmail === 'string' ? ctx.guestEmail : null;
    }

    if (!email) {
      this.logger.log(`payment.received email skipped for ${ctx.orderNo} — no customer email on file.`);
      return;
    }

    const amount = typeof ctx.grandTotal === 'string' ? ctx.grandTotal : String(ctx.grandTotal ?? '');
    await this.dispatch.dispatch({
      eventType: 'payment.received',
      recipient: { customerId: customerId ?? undefined, email },
      channels: [NotificationChannel.EMAIL],
      variables: { name, order_no: ctx.orderNo, ...(amount ? { amount } : {}) },
      relatedEntity: typeof ctx.orderId === 'string' ? { type: 'order', id: ctx.orderId } : undefined,
      idempotencyKey: `payment-received-email:${ctx.orderNo}`,
    });
    this.logger.log(`payment.received email queued for order ${ctx.orderNo}.`);
  }

  /** Read a registered customer's email + display name from the AUTH `customers` table (read-only). */
  private async resolveCustomerContact(
    customerId: string,
  ): Promise<{ email: string | null; name: string | null } | null> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT email, full_name FROM customers WHERE id = $1`,
      [customerId],
    );
    const r = rows[0];
    if (!r) return null;
    return { email: (r.email as string | null) ?? null, name: (r.full_name as string | null) ?? null };
  }
}
