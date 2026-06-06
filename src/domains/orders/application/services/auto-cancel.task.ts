import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { OrderPaymentMethod, OrderStatus } from '../../domain/order-enums';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { IOrderNotifier, ORDER_NOTIFIER } from '../ports/order-notifier.port';
import { OrderCreationService } from './order-creation.service';

/**
 * Auto-cancel + payment-reminder sweep for unpaid online orders (FR-ORD-012/012a). Online orders
 * stuck in `pending_payment` past the timeout (default 30 min) are cancelled and their reservation
 * released (via the INV port, in OrderCreationService.autoCancelUnpaid). A reminder (`order.payment_
 * reminder`) is sent ~10 min before cancellation (configurable), once per order. Implemented with a
 * self-managed interval (the repo has no `@nestjs/schedule` — mirrors ReservationExpiryTask); disabled
 * in tests so they drive the sweep manually.
 */
@Injectable()
export class AutoCancelTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoCancelTask.name);
  private readonly timeoutMs: number;
  private readonly reminderLeadMs: number;
  private readonly sweepMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(OrderOrmEntity) private readonly orders: Repository<OrderOrmEntity>,
    private readonly creation: OrderCreationService,
    @Inject(ORDER_NOTIFIER) private readonly notifier: IOrderNotifier,
    config: ConfigService,
  ) {
    this.timeoutMs = Number(config.get('ORDER_AUTO_CANCEL_MS') ?? 30 * 60 * 1000);
    this.reminderLeadMs = Number(config.get('ORDER_PAYMENT_REMINDER_LEAD_MS') ?? 10 * 60 * 1000);
    this.sweepMs = Number(config.get('ORDER_AUTO_CANCEL_SWEEP_MS') ?? 60 * 1000);
  }

  onModuleInit(): void {
    if (this.sweepMs <= 0 || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runSweep(), this.sweepMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One sweep: send due reminders, then cancel overdue unpaid online orders. Overlap-guarded. */
  async runSweep(now: Date = new Date()): Promise<{ reminded: number; cancelled: number }> {
    if (this.running) return { reminded: 0, cancelled: 0 };
    this.running = true;
    try {
      const reminded = await this.sendReminders(now);
      const cancelled = await this.cancelOverdue(now);
      return { reminded, cancelled };
    } catch (err) {
      this.logger.error(`Auto-cancel sweep failed: ${(err as Error).message}`);
      return { reminded: 0, cancelled: 0 };
    } finally {
      this.running = false;
    }
  }

  /** Send a one-time payment reminder to orders entering the reminder window before cancel. */
  private async sendReminders(now: Date): Promise<number> {
    const reminderThreshold = new Date(now.getTime() - (this.timeoutMs - this.reminderLeadMs));
    const due = await this.orders.find({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        placedAt: LessThan(reminderThreshold),
      },
    });
    let count = 0;
    for (const order of due) {
      if (order.paymentMethod === OrderPaymentMethod.COD || order.reminderSentAt) continue;
      await this.notifier.notify('order.payment_reminder', {
        orderNo: order.orderNo,
        customerId: order.customerId,
        guestPhone: order.guestPhone,
        guestEmail: order.guestEmail,
      });
      order.reminderSentAt = now;
      await this.orders.save(order);
      count += 1;
    }
    return count;
  }

  /** Cancel unpaid online orders past the timeout. */
  private async cancelOverdue(now: Date): Promise<number> {
    const cancelThreshold = new Date(now.getTime() - this.timeoutMs);
    const overdue = await this.orders.find({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        placedAt: LessThan(cancelThreshold),
      },
    });
    let count = 0;
    for (const order of overdue) {
      if (order.paymentMethod === OrderPaymentMethod.COD) continue;
      const cancelled = await this.creation.autoCancelUnpaid(order.id, now);
      if (cancelled) count += 1;
    }
    if (count > 0) this.logger.log(`Auto-cancelled ${count} unpaid online order(s).`);
    return count;
  }
}
