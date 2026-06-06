import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  OrderCreationService,
  PlaceOrderSnapshot,
} from '../services/order-creation.service';
import { OrderNumberingService } from '../services/order-numbering.service';
import { STOCK_COORDINATOR } from '../ports/stock-coordinator.port';
import { ORDER_NOTIFIER } from '../ports/order-notifier.port';
import {
  OrderDeliveryZone,
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';

const NOW = new Date('2026-06-03T10:00:00Z');

const buildSnapshot = (o: Partial<PlaceOrderSnapshot> = {}): PlaceOrderSnapshot => ({
  customer_id: 'c1',
  payment_method: OrderPaymentMethod.BKASH,
  delivery_zone: OrderDeliveryZone.INSIDE_DHAKA,
  address: {
    recipient_name: 'Sabbir',
    recipient_phone: '+8801712345678',
    address_line: 'House 12, Road 5, Dhanmondi',
  },
  items: [
    {
      product_id: 'p1',
      variant_id: 'v1',
      product_title: 'Predator Elite',
      sku_code: 'PRED-BLK-42',
      variant_options: { color: 'Black', size: '42' },
      unit_price: '12500.00',
      quantity: 1,
      line_total: '12500.00',
    },
  ],
  amounts: { subtotal: '12500.00', grand_total: '12620.00', delivery_charge: '120.00' },
  ...o,
});

describe('Orders — OrderCreationService', () => {
  let service: OrderCreationService;
  let orderRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let itemRepo: { create: jest.Mock; save: jest.Mock };
  let historyRepo: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let numbering: { next: jest.Mock };
  let stock: { decrement: jest.Mock; release: jest.Mock; restock: jest.Mock };
  let notifier: { notify: jest.Mock };

  const fakeManager = () => ({
    getRepository: (token: unknown) => {
      if (token === OrderOrmEntity) return orderRepo;
      if (token === OrderItemOrmEntity) return itemRepo;
      return historyRepo;
    },
  });

  beforeEach(async () => {
    orderRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((o) => o),
      save: jest.fn().mockImplementation((o) => Promise.resolve({ id: 'ord_1', ...o })),
    };
    itemRepo = {
      create: jest.fn().mockImplementation((i) => i),
      save: jest.fn().mockImplementation((i) => Promise.resolve(i)),
    };
    historyRepo = {
      create: jest.fn().mockImplementation((h) => h),
      save: jest.fn().mockImplementation((h) => Promise.resolve(h)),
    };
    dataSource = { transaction: jest.fn().mockImplementation(async (cb) => cb(fakeManager())) };
    numbering = { next: jest.fn().mockResolvedValue('SO-100000') };
    stock = { decrement: jest.fn(), release: jest.fn(), restock: jest.fn() };
    notifier = { notify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderCreationService,
        { provide: DataSource, useValue: dataSource },
        { provide: OrderNumberingService, useValue: numbering },
        { provide: STOCK_COORDINATOR, useValue: stock },
        { provide: ORDER_NOTIFIER, useValue: notifier },
      ],
    }).compile();

    service = module.get(OrderCreationService);
  });

  afterEach(() => jest.clearAllMocks());

  // --- place ---

  it('should create an online order pending_payment with an SO- number and item snapshots', async () => {
    const result = await service.place(buildSnapshot({ payment_method: OrderPaymentMethod.BKASH }), NOW);
    expect(result.orderNo).toBe('SO-100000');
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.PENDING_PAYMENT, paymentState: OrderPaymentState.UNPAID }),
    );
    expect(itemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ skuCode: 'PRED-BLK-42', unitPrice: '12500.00' }),
    );
    // Online order does not decrement stock yet (waits for paid).
    expect(stock.decrement).not.toHaveBeenCalled();
    expect(notifier.notify).toHaveBeenCalledWith('order.placed', expect.objectContaining({ orderNo: 'SO-100000' }));
  });

  it('should create a COD order confirmed and decrement stock + notify immediately', async () => {
    const result = await service.place(buildSnapshot({ payment_method: OrderPaymentMethod.COD }), NOW);
    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: OrderStatus.CONFIRMED, paymentState: OrderPaymentState.COD_PENDING }),
    );
    expect(stock.decrement).toHaveBeenCalledWith('ord_1');
    expect(notifier.notify).toHaveBeenCalledWith('order.confirmed', expect.anything());
  });

  it('should write a creation history entry from null → initial status', async () => {
    await service.place(buildSnapshot(), NOW);
    expect(historyRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: null, toStatus: OrderStatus.PENDING_PAYMENT }),
    );
  });

  it('should be idempotent: a replay with the same idempotency key returns the existing order', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_existing',
      orderNo: 'SO-100000',
      status: OrderStatus.PENDING_PAYMENT,
    });
    const result = await service.place(buildSnapshot({ idempotency_key: 'key-1' }), NOW);
    expect(result).toMatchObject({ orderId: 'ord_existing', orderNo: 'SO-100000' });
    expect(orderRepo.save).not.toHaveBeenCalled();
    expect(numbering.next).not.toHaveBeenCalled();
  });

  // --- reflectPaymentState ---

  it('should advance pending_payment → confirmed on paid, decrement stock and notify', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_1',
      orderNo: 'SO-100000',
      status: OrderStatus.PENDING_PAYMENT,
      paymentState: OrderPaymentState.UNPAID,
    });
    const result = await service.reflectPaymentState('SO-100000', OrderPaymentState.PAID, NOW);
    expect(result.status).toBe(OrderStatus.CONFIRMED);
    expect(stock.decrement).toHaveBeenCalledWith('ord_1');
    expect(notifier.notify).toHaveBeenCalledWith('order.payment_received', expect.anything());
  });

  it('should be idempotent on a repeated paid signal for an already-confirmed order', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_1',
      orderNo: 'SO-100000',
      status: OrderStatus.CONFIRMED,
      paymentState: OrderPaymentState.PAID,
    });
    await service.reflectPaymentState('SO-100000', OrderPaymentState.PAID, NOW);
    expect(stock.decrement).not.toHaveBeenCalled();
  });

  it('should keep pending_payment on a failed/unpaid payment outcome (retry)', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_1',
      orderNo: 'SO-100000',
      status: OrderStatus.PENDING_PAYMENT,
      paymentState: OrderPaymentState.UNPAID,
    });
    const result = await service.reflectPaymentState('SO-100000', OrderPaymentState.UNPAID, NOW);
    expect(result.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(stock.decrement).not.toHaveBeenCalled();
  });

  it('should throw ORDER_NOT_FOUND when the order does not exist', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(
      service.reflectPaymentState('SO-999999', OrderPaymentState.PAID, NOW),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // --- autoCancelUnpaid ---

  it('should cancel an unpaid order and release its reservation', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_1',
      orderNo: 'SO-100000',
      status: OrderStatus.PENDING_PAYMENT,
    });
    const cancelled = await service.autoCancelUnpaid('ord_1', NOW);
    expect(cancelled).toBe(true);
    expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: OrderStatus.CANCELLED }));
    expect(stock.release).toHaveBeenCalledWith('ord_1');
    expect(notifier.notify).toHaveBeenCalledWith('order.cancelled', expect.anything());
  });

  it('should be a no-op auto-cancel for an order no longer pending_payment (idempotent)', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'ord_1',
      orderNo: 'SO-100000',
      status: OrderStatus.CONFIRMED,
    });
    const cancelled = await service.autoCancelUnpaid('ord_1', NOW);
    expect(cancelled).toBe(false);
    expect(stock.release).not.toHaveBeenCalled();
  });
});
