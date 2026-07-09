import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

import { MovementService } from '../movement.service';
import {
  StockMovementActorType,
  StockMovementType,
} from '../../domain/stock-movement-type';
import { StockMovementOrmEntity } from '../../infrastructure/persistence/typeorm/entities/stock-movement.orm-entity';
import { OrderOrmEntity } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';

describe('Inventory — MovementService', () => {
  let service: MovementService;
  let repo: {
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let ordersRepo: { find: jest.Mock };
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      getMany: jest.fn().mockResolvedValue([]),
    };
    repo = {
      create: jest.fn().mockImplementation((x) => x),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };
    ordersRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementService,
        { provide: getRepositoryToken(StockMovementOrmEntity), useValue: repo },
        { provide: getRepositoryToken(OrderOrmEntity), useValue: ordersRepo },
      ],
    }).compile();
    service = module.get(MovementService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should insert a movement via the caller’s manager and return its id (FR-INV-050)', async () => {
    const txRepo = {
      create: jest.fn().mockImplementation((x) => x),
      save: jest.fn().mockResolvedValue({ id: 'mv-99' }),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(txRepo) } as unknown as EntityManager;

    const id = await service.recordMovement(manager, {
      type: StockMovementType.SALE,
      variantId: 'v1',
      quantityDelta: -1,
      resultingOnHand: 51,
      orderId: 'ord-1',
      actor: { type: StockMovementActorType.SYSTEM },
    });

    expect(id).toBe('mv-99');
    expect(txRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sale',
        variantId: 'v1',
        quantityDelta: -1,
        resultingOnHand: 51,
        orderId: 'ord-1',
        actorType: 'system',
        actorId: null,
      }),
    );
  });

  it('should query newest-first and apply type + date filters (FR-INV-051)', async () => {
    qb.getCount.mockResolvedValue(2);
    qb.getMany.mockResolvedValue([
      {
        id: 'mv-2',
        type: StockMovementType.RECEIVE,
        quantityDelta: 50,
        resultingOnHand: 52,
        reason: 'grn',
        orderId: null,
        actorType: StockMovementActorType.ADMIN,
        actorId: 'admin-1',
        createdAt: new Date('2026-06-03T09:00:00Z'),
      },
    ]);

    const result = await service.listForVariant('v1', {
      page: 1,
      limit: 50,
      type: StockMovementType.RECEIVE,
      from: new Date('2026-06-01'),
      to: new Date('2026-06-04'),
    });

    expect(result.meta).toEqual({ page: 1, limit: 50, total: 2 });
    expect(result.items[0]).toMatchObject({ id: 'mv-2', type: 'receive', quantity_delta: 50 });
    expect(qb.orderBy).toHaveBeenCalledWith('mv.created_at', 'DESC');
    expect(qb.andWhere).toHaveBeenCalledWith('mv.type = :type', { type: 'receive' });
  });

  it('should resolve each linked order_id to its order_no for the ledger (BR-ORD-2)', async () => {
    qb.getCount.mockResolvedValue(2);
    qb.getMany.mockResolvedValue([
      {
        id: 'mv-1',
        type: StockMovementType.RESERVE,
        quantityDelta: 0,
        resultingOnHand: 12,
        reason: null,
        orderId: 'a9ff5833-c744-4bbb-a625-a374147e46c2',
        actorType: StockMovementActorType.SYSTEM,
        actorId: null,
        createdAt: new Date('2026-06-21T17:47:00Z'),
      },
      {
        id: 'mv-0',
        type: StockMovementType.RECEIVE,
        quantityDelta: 20,
        resultingOnHand: 32,
        reason: 'new stock',
        orderId: null,
        actorType: StockMovementActorType.ADMIN,
        actorId: 'admin-1',
        createdAt: new Date('2026-06-21T23:55:00Z'),
      },
    ]);
    ordersRepo.find.mockResolvedValue([
      { id: 'a9ff5833-c744-4bbb-a625-a374147e46c2', orderNo: 'SO-100245' },
    ]);

    const result = await service.listForVariant('v1', { page: 1, limit: 50 });

    // Linked movement carries the resolved order number; unlinked one stays null.
    expect(result.items[0]).toMatchObject({ order_id: 'a9ff5833-c744-4bbb-a625-a374147e46c2', order_no: 'SO-100245' });
    expect(result.items[1]).toMatchObject({ order_id: null, order_no: null });
    // Only the distinct, non-null order id is looked up.
    expect(ordersRepo.find).toHaveBeenCalledTimes(1);
  });

  it('should not query orders when no movement on the page is linked to one', async () => {
    qb.getCount.mockResolvedValue(1);
    qb.getMany.mockResolvedValue([
      {
        id: 'mv-x',
        type: StockMovementType.RECEIVE,
        quantityDelta: 5,
        resultingOnHand: 5,
        reason: 'grn',
        orderId: null,
        actorType: StockMovementActorType.ADMIN,
        actorId: 'admin-1',
        createdAt: new Date('2026-06-21T23:55:00Z'),
      },
    ]);

    const result = await service.listForVariant('v1', { page: 1, limit: 50 });

    expect(result.items[0].order_no).toBeNull();
    expect(ordersRepo.find).not.toHaveBeenCalled();
  });
});
