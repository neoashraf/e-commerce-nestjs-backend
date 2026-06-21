import { Repository } from 'typeorm';

import {
  OrderPaymentMethod,
  OrderPaymentState,
  OrderStatus,
} from '../../domain/order-enums';
import { PaymentOrmEntity } from '../../../payments/infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrderTrackingService } from '../services/order-tracking.service';

/** A payments-repo stub whose findOne resolves to the given payment id (or null when none). */
function paymentsRepo(id: string | null = null) {
  return {
    findOne: jest.fn().mockResolvedValue(id ? { id } : null),
  } as unknown as Repository<PaymentOrmEntity>;
}

/** A chainable query-builder stub whose getManyAndCount resolves to the given rows + total. */
function buildQb(rows: Partial<OrderOrmEntity>[], total: number) {
  const qb = {
    orderBy: jest.fn(),
    skip: jest.fn(),
    take: jest.fn(),
    andWhere: jest.fn(),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
  };
  qb.orderBy.mockReturnValue(qb);
  qb.skip.mockReturnValue(qb);
  qb.take.mockReturnValue(qb);
  qb.andWhere.mockReturnValue(qb);
  return qb;
}

function makeService(qb: ReturnType<typeof buildQb>) {
  const orders = { createQueryBuilder: jest.fn(() => qb) } as unknown as Repository<OrderOrmEntity>;
  return new OrderTrackingService(
    orders,
    {} as Repository<OrderItemOrmEntity>,
    {} as Repository<OrderStatusHistoryOrmEntity>,
    paymentsRepo(),
    { getByProductIds: jest.fn().mockResolvedValue(new Map()) },
  );
}

const order = (o: Partial<OrderOrmEntity> = {}): Partial<OrderOrmEntity> => ({
  orderNo: 'SO-100245',
  guestName: null,
  guestPhone: null,
  addressSnapshot: {
    recipient_name: 'Sabbir Ahmed',
    recipient_phone: '+8801712345678',
    address_line: 'House 12',
  },
  status: OrderStatus.PROCESSING,
  paymentMethod: OrderPaymentMethod.BKASH,
  paymentState: OrderPaymentState.PAID,
  grandTotal: '12241.20',
  placedAt: new Date('2026-06-03T10:00:00.000Z'),
  ...o,
});

describe('Orders — OrderTrackingService.listAdminOrders', () => {
  it('maps a row to the contract shape and returns pagination meta', async () => {
    const qb = buildQb([order()], 128);
    const result = await makeService(qb).listAdminOrders({ page: 1, limit: 50 });

    expect(result.items[0]).toEqual({
      order_no: 'SO-100245',
      customer: { name: 'Sabbir Ahmed', phone: '+8801712345678' },
      status: OrderStatus.PROCESSING,
      payment_method: OrderPaymentMethod.BKASH,
      payment_state: OrderPaymentState.PAID,
      grand_total: '12241.20',
      placed_at: '2026-06-03T10:00:00.000Z',
    });
    expect(result.meta).toEqual({ page: 1, limit: 50, total: 128 });
  });

  it('prefers the guest name/phone over the address recipient when present', async () => {
    const qb = buildQb([order({ guestName: 'Guest Buyer', guestPhone: '+8801999000111' })], 1);
    const result = await makeService(qb).listAdminOrders({});

    expect(result.items[0].customer).toEqual({ name: 'Guest Buyer', phone: '+8801999000111' });
  });

  it('applies every filter via andWhere and makes a date-only `to` inclusive of the day', async () => {
    const qb = buildQb([], 0);
    await makeService(qb).listAdminOrders({
      status: OrderStatus.SHIPPED,
      paymentState: OrderPaymentState.PAID,
      q: 'SO-100',
      phone: '017',
      from: '2026-06-01',
      to: '2026-06-04',
    });

    expect(qb.andWhere).toHaveBeenCalledTimes(6);
    expect(qb.andWhere).toHaveBeenCalledWith('o.placedAt <= :to', {
      to: '2026-06-04T23:59:59.999Z',
    });
  });

  it('defaults to page 1 / limit 20 (skip 0, take 20)', async () => {
    const qb = buildQb([], 0);
    await makeService(qb).listAdminOrders({});

    expect(qb.skip).toHaveBeenCalledWith(0);
    expect(qb.take).toHaveBeenCalledWith(20);
  });
});

describe('Orders — OrderTrackingService.toDetail (RW6)', () => {
  function detailService(
    snapshotMap: Map<string, { product_image: string | null; product_title_bn: string | null }>,
    paymentId: string | null = null,
  ) {
    return new OrderTrackingService(
      {} as Repository<OrderOrmEntity>,
      {} as Repository<OrderItemOrmEntity>,
      {} as Repository<OrderStatusHistoryOrmEntity>,
      paymentsRepo(paymentId),
      { getByProductIds: jest.fn().mockResolvedValue(snapshotMap) },
    );
  }

  const item = (over: Partial<OrderItemOrmEntity> = {}): OrderItemOrmEntity =>
    ({
      productId: 'prod-1',
      productTitle: 'Adidas Predator Elite',
      skuCode: 'PRED-BLK-42',
      variantOptions: { color: 'Black', size: '42' },
      unitPrice: '12500.00',
      quantity: 1,
      lineTotal: '12500.00',
      ...over,
    }) as OrderItemOrmEntity;

  const aggregate = (items: OrderItemOrmEntity[]) => ({
    order: order({ appliedCouponCode: null, courierName: null, trackingNumber: null }) as OrderOrmEntity,
    items,
    history: [],
  });

  it('surfaces placed_at + enriches each line with product_image + product_title_bn', async () => {
    const svc = detailService(
      new Map([['prod-1', { product_image: 'https://cdn/listing.webp', product_title_bn: 'প্রিডেটর এলিট' }]]),
    );
    const detail = await svc.toDetail(aggregate([item()]));

    expect(detail.placed_at).toBe('2026-06-03T10:00:00.000Z');
    expect(detail.items[0]).toMatchObject({
      product_title: 'Adidas Predator Elite',
      product_title_bn: 'প্রিডেটর এলিট',
      product_image: 'https://cdn/listing.webp',
      line_total: '12500.00',
    });
  });

  it('falls back to null image/Bangla title when the product snapshot is absent', async () => {
    const svc = detailService(new Map());
    const detail = await svc.toDetail(aggregate([item({ productId: 'gone' })]));

    expect(detail.items[0].product_image).toBeNull();
    expect(detail.items[0].product_title_bn).toBeNull();
  });

  it("surfaces the order's payment id for the admin payment panel (null when none)", async () => {
    const withPayment = await detailService(new Map(), 'pay-123').toDetail(aggregate([item()]));
    expect(withPayment.payment_id).toBe('pay-123');

    const noPayment = await detailService(new Map()).toDetail(aggregate([item()]));
    expect(noPayment.payment_id).toBeNull();
  });
});
