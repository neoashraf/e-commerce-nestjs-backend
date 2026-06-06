import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';

import { AutoCancelTask } from '../services/auto-cancel.task';
import { OrderCreationService } from '../services/order-creation.service';
import { ORDER_NOTIFIER } from '../ports/order-notifier.port';
import { OrderPaymentMethod, OrderStatus } from '../../domain/order-enums';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';

const NOW = new Date('2026-06-03T11:00:00Z');

describe('Orders — AutoCancelTask', () => {
  let task: AutoCancelTask;
  let orders: { find: jest.Mock; save: jest.Mock };
  let creation: { autoCancelUnpaid: jest.Mock };
  let notifier: { notify: jest.Mock };

  beforeEach(async () => {
    orders = { find: jest.fn().mockResolvedValue([]), save: jest.fn().mockImplementation((o) => o) };
    creation = { autoCancelUnpaid: jest.fn().mockResolvedValue(true) };
    notifier = { notify: jest.fn() };

    const config = {
      get: (key: string) => {
        const map: Record<string, number> = {
          ORDER_AUTO_CANCEL_MS: 30 * 60 * 1000,
          ORDER_PAYMENT_REMINDER_LEAD_MS: 10 * 60 * 1000,
          ORDER_AUTO_CANCEL_SWEEP_MS: 0, // disable the interval; we drive runSweep manually
        };
        return map[key];
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoCancelTask,
        { provide: getRepositoryToken(OrderOrmEntity), useValue: orders },
        { provide: OrderCreationService, useValue: creation },
        { provide: ORDER_NOTIFIER, useValue: notifier },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    task = module.get(AutoCancelTask);
  });

  afterEach(() => jest.clearAllMocks());

  it('should send a one-time reminder for an online order entering the reminder window', async () => {
    // First find() = reminder query, second find() = cancel query.
    orders.find
      .mockResolvedValueOnce([
        {
          id: 'ord_1',
          orderNo: 'SO-100000',
          paymentMethod: OrderPaymentMethod.BKASH,
          status: OrderStatus.PENDING_PAYMENT,
          reminderSentAt: null,
        },
      ])
      .mockResolvedValueOnce([]);
    const result = await task.runSweep(NOW);
    expect(result.reminded).toBe(1);
    expect(notifier.notify).toHaveBeenCalledWith('order.payment_reminder', expect.objectContaining({ orderNo: 'SO-100000' }));
    expect(orders.save).toHaveBeenCalledWith(expect.objectContaining({ reminderSentAt: NOW }));
  });

  it('should not re-send a reminder already sent', async () => {
    orders.find
      .mockResolvedValueOnce([
        { id: 'ord_1', orderNo: 'SO-100000', paymentMethod: OrderPaymentMethod.BKASH, reminderSentAt: NOW },
      ])
      .mockResolvedValueOnce([]);
    const result = await task.runSweep(NOW);
    expect(result.reminded).toBe(0);
    expect(notifier.notify).not.toHaveBeenCalled();
  });

  it('should cancel overdue unpaid online orders via the creation service', async () => {
    orders.find
      .mockResolvedValueOnce([]) // reminders
      .mockResolvedValueOnce([
        { id: 'ord_9', orderNo: 'SO-100009', paymentMethod: OrderPaymentMethod.SSLCOMMERZ },
      ]);
    const result = await task.runSweep(NOW);
    expect(result.cancelled).toBe(1);
    expect(creation.autoCancelUnpaid).toHaveBeenCalledWith('ord_9', NOW);
  });

  it('should skip COD orders in both reminder and cancel passes', async () => {
    orders.find
      .mockResolvedValueOnce([
        { id: 'ord_c', orderNo: 'SO-1', paymentMethod: OrderPaymentMethod.COD, reminderSentAt: null },
      ])
      .mockResolvedValueOnce([
        { id: 'ord_c', orderNo: 'SO-1', paymentMethod: OrderPaymentMethod.COD },
      ]);
    const result = await task.runSweep(NOW);
    expect(result).toEqual({ reminded: 0, cancelled: 0 });
    expect(creation.autoCancelUnpaid).not.toHaveBeenCalled();
  });
});
