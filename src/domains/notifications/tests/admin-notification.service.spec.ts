import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';

import { AdminNotificationBus } from '../admin-notification-bus';
import { AdminNotificationService } from '../admin-notification.service';
import { AdminNotificationEntity } from '../entities/admin-notification.entity';
import { ADMIN_RECIPIENT_RESOLVER } from '../ports/admin-recipient-resolver.port';

const ORDER_INPUT = {
  orderId: 'ord_1',
  orderNo: 'SO-100247',
  grandTotal: '4250.00',
  itemCount: 2,
  customerName: 'Sabbir Ahmed',
  paymentMethod: 'cod',
};

describe('Notifications — AdminNotificationService', () => {
  let service: AdminNotificationService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let bus: { publish: jest.Mock; streamFor: jest.Mock };
  let resolver: { findAdminIdsByPermission: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((o) => ({ id: 'gen', createdAt: new Date('2026-06-18T08:00:00Z'), ...o })),
      save: jest.fn().mockImplementation((o) => Promise.resolve(o)),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn(),
    };
    bus = { publish: jest.fn(), streamFor: jest.fn() };
    resolver = { findAdminIdsByPermission: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotificationService,
        { provide: getRepositoryToken(AdminNotificationEntity), useValue: repo },
        { provide: AdminNotificationBus, useValue: bus },
        { provide: ADMIN_RECIPIENT_RESOLVER, useValue: resolver },
      ],
    }).compile();

    service = module.get(AdminNotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('emitOrderPlaced', () => {
    it('creates one row per order-permissioned admin and publishes each to the bus (FR-NOTIF-070/071)', async () => {
      resolver.findAdminIdsByPermission.mockResolvedValue(['a1', 'a2']);
      await service.emitOrderPlaced(ORDER_INPUT);

      expect(resolver.findAdminIdsByPermission).toHaveBeenCalledWith('orders.order.read');
      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientAdminId: 'a1',
          eventType: 'order.placed',
          type: 'order',
          link: '/admin/orders/SO-100247',
          idempotencyKey: 'order.placed:ord_1',
        }),
      );
      expect(bus.publish).toHaveBeenCalledTimes(2);
      expect(bus.publish).toHaveBeenCalledWith('a1', expect.objectContaining({ title: 'New order SO-100247' }));
    });

    it('carries the structured data payload for the client', async () => {
      resolver.findAdminIdsByPermission.mockResolvedValue(['a1']);
      await service.emitOrderPlaced(ORDER_INPUT);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            order_no: 'SO-100247',
            grand_total: '4250.00',
            item_count: 2,
            customer_name: 'Sabbir Ahmed',
            payment_method: 'cod',
          },
        }),
      );
    });

    it('is a no-op when no admin holds the permission (FR-NOTIF-070, §11)', async () => {
      resolver.findAdminIdsByPermission.mockResolvedValue([]);
      await service.emitOrderPlaced(ORDER_INPUT);
      expect(repo.save).not.toHaveBeenCalled();
      expect(bus.publish).not.toHaveBeenCalled();
    });

    it('dedupes a re-fired trigger: a unique-violation per admin is skipped, not published (FR-NOTIF-076)', async () => {
      resolver.findAdminIdsByPermission.mockResolvedValue(['a1', 'a2']);
      const dup = new QueryFailedError('insert', [], new Error('dup'));
      (dup as QueryFailedError & { code?: string }).code = '23505';
      repo.save
        .mockImplementationOnce((o) => Promise.resolve(o)) // a1 inserted
        .mockImplementationOnce(() => Promise.reject(dup)); // a2 duplicate

      await service.emitOrderPlaced(ORDER_INPUT);

      expect(repo.save).toHaveBeenCalledTimes(2);
      expect(bus.publish).toHaveBeenCalledTimes(1);
      expect(bus.publish).toHaveBeenCalledWith('a1', expect.anything());
    });

    it('rethrows a non-unique DB error', async () => {
      resolver.findAdminIdsByPermission.mockResolvedValue(['a1']);
      repo.save.mockRejectedValueOnce(new QueryFailedError('insert', [], new Error('boom')));
      await expect(service.emitOrderPlaced(ORDER_INPUT)).rejects.toBeInstanceOf(QueryFailedError);
    });
  });

  describe('read state', () => {
    it('markRead updates only the admin-owned unread row and returns the fresh unread count (FR-NOTIF-074)', async () => {
      repo.count.mockResolvedValue(4);
      const result = await service.markRead('a1', '11111111-1111-1111-1111-111111111111');
      expect(repo.update).toHaveBeenCalledWith(
        { id: '11111111-1111-1111-1111-111111111111', recipientAdminId: 'a1', isRead: false },
        expect.objectContaining({ isRead: true }),
      );
      expect(result).toEqual({ id: '11111111-1111-1111-1111-111111111111', isRead: true, unread: 4 });
    });

    it('markAllRead clears the admin unread set and reports how many were marked (FR-NOTIF-074)', async () => {
      repo.update.mockResolvedValue({ affected: 5 });
      const result = await service.markAllRead('a1');
      expect(repo.update).toHaveBeenCalledWith(
        { recipientAdminId: 'a1', isRead: false },
        expect.objectContaining({ isRead: true }),
      );
      expect(result).toEqual({ marked: 5, unread: 0 });
    });

    it('unreadCount counts only the admin-owned unread rows', async () => {
      repo.count.mockResolvedValue(3);
      await expect(service.unreadCount('a1')).resolves.toBe(3);
      expect(repo.count).toHaveBeenCalledWith({ where: { recipientAdminId: 'a1', isRead: false } });
    });
  });
});
