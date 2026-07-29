import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { OrderStatus } from '../../../orders/domain/order-enums';
import { OrderOrmEntity } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrdOrderHistoryReader } from '../adapters/ord-order-history.reader';

describe('Promotions — OrdOrderHistoryReader (first-order-only, FR-PROMO-007)', () => {
  let reader: OrdOrderHistoryReader;
  let qb: { where: jest.Mock; andWhere: jest.Mock; getExists: jest.Mock };
  let orders: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    orders = { createQueryBuilder: jest.fn().mockReturnValue(qb) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdOrderHistoryReader,
        { provide: getRepositoryToken(OrderOrmEntity), useValue: orders },
      ],
    }).compile();
    reader = module.get(OrdOrderHistoryReader);
  });

  afterEach(() => jest.clearAllMocks());

  it('should report a prior order when the customer has one', async () => {
    qb.getExists.mockResolvedValue(true);
    await expect(reader.hasPriorCompletedOrder({ customer_id: 'c_1' })).resolves.toBe(true);
    expect(qb.andWhere).toHaveBeenCalledWith('o.customerId = :customerId', { customerId: 'c_1' });
  });

  it('should report no prior order for a first-time customer', async () => {
    qb.getExists.mockResolvedValue(false);
    await expect(reader.hasPriorCompletedOrder({ customer_id: 'c_1' })).resolves.toBe(false);
  });

  it('should exclude pending_payment and cancelled orders from the history', async () => {
    await reader.hasPriorCompletedOrder({ customer_id: 'c_1' });
    expect(qb.where).toHaveBeenCalledWith('o.status NOT IN (:...excluded)', {
      excluded: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
    });
  });

  it('should match on guest_phone when there is no customer id', async () => {
    await reader.hasPriorCompletedOrder({ guest_phone: '+8801712345678' });
    expect(qb.andWhere).toHaveBeenCalledWith('o.guestPhone = :guestPhone', {
      guestPhone: '+8801712345678',
    });
  });

  it('should match either identity when both are known (legacy pre-gate guest orders)', async () => {
    await reader.hasPriorCompletedOrder({ customer_id: 'c_1', guest_phone: '+8801712345678' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(o.customerId = :customerId OR o.guestPhone = :guestPhone)',
      { customerId: 'c_1', guestPhone: '+8801712345678' },
    );
  });

  it('should exclude the order being placed so it is not its own prior order', async () => {
    await reader.hasPriorCompletedOrder({ customer_id: 'c_1' }, 'ord_new');
    expect(qb.andWhere).toHaveBeenCalledWith('o.id != :excludeOrderId', {
      excludeOrderId: 'ord_new',
    });
  });

  it('should not add an exclusion when no order id is given', async () => {
    await reader.hasPriorCompletedOrder({ customer_id: 'c_1' });
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      'o.id != :excludeOrderId',
      expect.anything(),
    );
  });

  it('should not query at all for an anonymous identity', async () => {
    await expect(reader.hasPriorCompletedOrder({})).resolves.toBe(false);
    expect(orders.createQueryBuilder).not.toHaveBeenCalled();
  });
});
