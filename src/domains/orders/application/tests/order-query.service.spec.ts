import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { In } from 'typeorm';

import { OrderQueryService } from '../services/order-query.service';
import { OrderStatus } from '../../domain/order-enums';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';

describe('Orders — OrderQueryService (dashboard read side)', () => {
  let service: OrderQueryService;
  let repo: { count: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    repo = { count: jest.fn(), find: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderQueryService,
        { provide: getRepositoryToken(OrderOrmEntity), useValue: repo },
      ],
    }).compile();
    service = module.get(OrderQueryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('getActionCounts counts pending-payment, to-process (confirmed+processing), and to-ship (packed)', async () => {
    repo.count
      .mockResolvedValueOnce(2) // pending_payment
      .mockResolvedValueOnce(5) // confirmed + processing
      .mockResolvedValueOnce(1); // packed

    const counts = await service.getActionCounts();

    expect(counts).toEqual({ pendingPayment: 2, toProcess: 5, toShip: 1 });
    expect(repo.count).toHaveBeenNthCalledWith(1, { where: { status: OrderStatus.PENDING_PAYMENT } });
    expect(repo.count).toHaveBeenNthCalledWith(2, {
      where: { status: In([OrderStatus.CONFIRMED, OrderStatus.PROCESSING]) },
    });
    expect(repo.count).toHaveBeenNthCalledWith(3, { where: { status: OrderStatus.PACKED } });
  });

  it('getRecentOrders returns newest-first rows with a guest/recipient display name', async () => {
    repo.find.mockResolvedValue([
      {
        orderNo: 'SO-100247',
        guestName: 'Karim',
        addressSnapshot: { recipient_name: 'Someone Else' },
        grandTotal: '4250.00',
        status: OrderStatus.PENDING_PAYMENT,
        placedAt: new Date('2026-06-18T08:41:00.000Z'),
      },
      {
        orderNo: 'SO-100246',
        guestName: null,
        addressSnapshot: { recipient_name: 'Rafiq Islam' },
        grandTotal: '1890.00',
        status: OrderStatus.CONFIRMED,
        placedAt: new Date('2026-06-18T08:10:00.000Z'),
      },
    ]);

    const rows = await service.getRecentOrders(8);

    expect(repo.find).toHaveBeenCalledWith({ order: { placedAt: 'DESC' }, take: 8 });
    expect(rows).toEqual([
      { order_no: 'SO-100247', customer: 'Karim', grand_total: '4250.00', status: 'pending_payment', placed_at: '2026-06-18T08:41:00.000Z' },
      { order_no: 'SO-100246', customer: 'Rafiq Islam', grand_total: '1890.00', status: 'confirmed', placed_at: '2026-06-18T08:10:00.000Z' },
    ]);
  });
});
