import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationService } from '../reservation.service';
import { MovementService } from '../movement.service';
import { ReservationStatus } from '../../domain/reservation-status';
import { StockMovementType } from '../../domain/stock-movement-type';
import { InventoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { StockReservationOrmEntity } from '../../infrastructure/persistence/typeorm/entities/stock-reservation.orm-entity';

interface Inv {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
}

interface Res {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
}

interface Mv {
  orderId: string | null;
  type: StockMovementType;
}

/**
 * In-memory fake of the bits of TypeORM that ReservationService touches: inventory rows, reservation
 * rows, and the stock_movements existence query used for idempotency / the §12.6 sale guard.
 */
function makeFakes() {
  const inv = new Map<string, Inv>();
  const reservations: Res[] = [];
  const movements: Mv[] = [];
  let resSeq = 0;

  const matchWhere = (r: Res, where: { orderId?: string; status?: ReservationStatus }) =>
    (where.orderId === undefined || r.orderId === where.orderId) &&
    (where.status === undefined || r.status === where.status);

  const reservationRepo = {
    find: jest.fn(async (opts: { where: { orderId?: string; status?: ReservationStatus } }) =>
      reservations.filter((r) => matchWhere(r, opts.where)),
    ),
    count: jest.fn(async (opts: { where: { orderId?: string; status?: ReservationStatus } }) =>
      reservations.filter((r) => matchWhere(r, opts.where)).length,
    ),
    create: jest.fn((x: Partial<Res>) => ({ ...x })),
    save: jest.fn(async (x: Res) => {
      if (!x.id) {
        x.id = `res-${++resSeq}`;
        reservations.push(x);
      }
      return x;
    }),
  };

  const inventoryRepo = {
    findOne: jest.fn(async (opts: { where: { variantId: string } }) =>
      inv.get(opts.where.variantId) ?? null,
    ),
    save: jest.fn(async (row: Inv) => row),
    createQueryBuilder: jest.fn(() => {
      let ids: string[] = [];
      const builder: Record<string, jest.Mock> = {};
      builder.setLock = jest.fn(() => builder);
      builder.where = jest.fn((_clause: string, params: { ids: string[] }) => {
        ids = params.ids;
        return builder;
      });
      builder.orderBy = jest.fn(() => builder);
      builder.getMany = jest.fn(async () => ids.map((id) => inv.get(id)).filter(Boolean) as Inv[]);
      return builder;
    }),
  };

  const managerCreateQueryBuilder = jest.fn(() => {
    let orderId: string | null = null;
    let type: StockMovementType | null = null;
    const builder: Record<string, jest.Mock> = {};
    builder.select = jest.fn(() => builder);
    builder.from = jest.fn(() => builder);
    builder.where = jest.fn((_c: string, p: { orderId: string }) => {
      orderId = p.orderId;
      return builder;
    });
    builder.andWhere = jest.fn((_c: string, p: { type: StockMovementType }) => {
      type = p.type;
      return builder;
    });
    builder.limit = jest.fn(() => builder);
    builder.getRawOne = jest.fn(async () =>
      movements.find((m) => m.orderId === orderId && m.type === type) ? { '1': 1 } : undefined,
    );
    return builder;
  });

  const manager = {
    getRepository: jest.fn((entity: unknown) =>
      entity === StockReservationOrmEntity ? reservationRepo : inventoryRepo,
    ),
    createQueryBuilder: managerCreateQueryBuilder,
  };

  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };

  return { inv, reservations, movements, inventoryRepo, dataSource, manager };
}

describe('Inventory — ReservationService', () => {
  let service: ReservationService;
  let fakes: ReturnType<typeof makeFakes>;
  let recordMovement: jest.Mock;

  beforeEach(async () => {
    fakes = makeFakes();
    // recordMovement records into the in-memory movements list so idempotency guards see them.
    recordMovement = jest.fn(async (_m, input) => {
      fakes.movements.push({ orderId: input.orderId ?? null, type: input.type });
      return `mv-${fakes.movements.length}`;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationService,
        { provide: getRepositoryToken(InventoryOrmEntity), useValue: fakes.inventoryRepo },
        {
          provide: getRepositoryToken(StockReservationOrmEntity),
          useValue: {
            find: jest.fn(async (opts: { where: { status?: ReservationStatus } }) =>
              fakes.reservations.filter(
                (r) => opts.where.status === undefined || r.status === opts.where.status,
              ),
            ),
          },
        },
        { provide: DataSource, useValue: fakes.dataSource },
        { provide: MovementService, useValue: { recordMovement } },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = module.get(ReservationService);
  });

  const seed = (variantId: string, onHand: number, reserved = 0) =>
    fakes.inv.set(variantId, { variantId, onHand, reserved, available: onHand - reserved });

  it('should reserve and hold available, writing reserve movements (FR-INV-020)', async () => {
    seed('v1', 5);
    const res = await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    expect(res.reserved).toBe(true);
    expect(fakes.inv.get('v1')).toMatchObject({ reserved: 2, available: 3 });
    expect(recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: StockMovementType.RESERVE, orderId: 'ord-1' }),
    );
  });

  it('should be idempotent on a repeated reserve for the same order (FR-INV-023)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    expect(fakes.inv.get('v1')).toMatchObject({ reserved: 2, available: 3 }); // not doubled
  });

  it('should reject with 409 INSUFFICIENT_STOCK + shortfalls and hold nothing (BR-INV-1, §12.1)', async () => {
    seed('v1', 1);
    await expect(
      service.reserve('ord-2', [{ variantId: 'v1', quantity: 2 }]),
    ).rejects.toMatchObject({
      response: { code: 'INSUFFICIENT_STOCK', shortfalls: [{ variant_id: 'v1', requested: 2, available: 1 }] },
    });
    expect(fakes.inv.get('v1')).toMatchObject({ reserved: 0, available: 1 });
  });

  it('should decrement (sale): on_hand + reserved drop, sale movement, consumed (FR-INV-030)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    const res = await service.decrement('ord-1');
    expect(res.decremented).toBe(true);
    expect(res.already_applied).toBeUndefined();
    expect(fakes.inv.get('v1')).toMatchObject({ onHand: 3, reserved: 0, available: 3 });
    expect(fakes.movements.some((m) => m.type === StockMovementType.SALE)).toBe(true);
  });

  it('should be idempotent on a decrement replay → already_applied (FR-INV-033)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    await service.decrement('ord-1');
    const replay = await service.decrement('ord-1');
    expect(replay.already_applied).toBe(true);
    expect(fakes.inv.get('v1')).toMatchObject({ onHand: 3 }); // unchanged
  });

  it('should flag 409 OVERSELL rather than going negative (BR-INV-8, §12.4)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    // Simulate physical loss before decrement.
    fakes.inv.get('v1')!.onHand = 1;
    await expect(service.decrement('ord-1')).rejects.toBeInstanceOf(ConflictException);
    expect(fakes.inv.get('v1')!.onHand).toBe(1); // not negative
  });

  it('should release and restore available, marking released (FR-INV-022)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    const res = await service.release('ord-1');
    expect(res.released).toBe(true);
    expect(fakes.inv.get('v1')).toMatchObject({ reserved: 0, available: 5 });
    expect(fakes.reservations[0].status).toBe(ReservationStatus.RELEASED);
  });

  it('should be a no-op release when nothing is held (idempotent)', async () => {
    const res = await service.release('ord-unknown');
    expect(res.released).toBe(true);
  });

  it('should restock (restocked) only after a prior sale, increasing on_hand (FR-INV-031, §12.6)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    await service.decrement('ord-1'); // on_hand 3, a sale exists
    const res = await service.restock('ord-1', 'restocked', [{ variantId: 'v1', quantity: 2 }]);
    expect(res.applied).toBe(true);
    expect(fakes.inv.get('v1')).toMatchObject({ onHand: 5 });
    expect(fakes.movements.some((m) => m.type === StockMovementType.RESTOCK)).toBe(true);
  });

  it('should scrap with a movement and NO stock added (FR-INV-032)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    await service.decrement('ord-1'); // on_hand 3
    const res = await service.restock('ord-1', 'scrapped', [{ variantId: 'v1', quantity: 2 }]);
    expect(res.disposition).toBe('scrapped');
    expect(fakes.inv.get('v1')).toMatchObject({ onHand: 3 }); // unchanged
    expect(fakes.movements.some((m) => m.type === StockMovementType.SCRAP)).toBe(true);
  });

  it('should be idempotent on a restock replay (FR-INV-033)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    await service.decrement('ord-1');
    await service.restock('ord-1', 'restocked', [{ variantId: 'v1', quantity: 2 }]);
    const replay = await service.restock('ord-1', 'restocked', [{ variantId: 'v1', quantity: 2 }]);
    expect(replay.already_applied).toBe(true);
    expect(fakes.inv.get('v1')).toMatchObject({ onHand: 5 }); // not doubled
  });

  it('should release expired held reservations on the sweep (FR-INV-021)', async () => {
    seed('v1', 5);
    await service.reserve('ord-1', [{ variantId: 'v1', quantity: 2 }]);
    // Force the hold into the past.
    fakes.reservations[0].expiresAt = new Date(Date.now() - 1000);
    const released = await service.releaseExpiredReservations(new Date());
    expect(released).toBe(1);
    expect(fakes.inv.get('v1')).toMatchObject({ reserved: 0, available: 5 });
    expect(fakes.reservations[0].status).toBe(ReservationStatus.EXPIRED);
  });
});
