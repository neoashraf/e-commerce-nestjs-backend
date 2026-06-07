import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { InventoryService } from '../inventory.service';
import { MovementService } from '../movement.service';
import { LowStockAlertService } from '../low-stock-alert.service';
import { StockStatus } from '../../domain/stock-status';
import { StockMovementActorType } from '../../domain/stock-movement-type';
import { InventoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/inventory.orm-entity';

const ADMIN_ACTOR = { type: StockMovementActorType.ADMIN, id: 'admin-1' };

describe('Inventory — InventoryService', () => {
  let service: InventoryService;
  let inventory: { find: jest.Mock; findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let movements: { recordMovement: jest.Mock; listForVariant: jest.Mock };
  let lockedRow: { onHand: number; reserved: number; available: number; lowStockThreshold: number; variantId: string } | null;
  let savedRow: typeof lockedRow;

  beforeEach(async () => {
    inventory = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
    movements = {
      recordMovement: jest.fn().mockResolvedValue('mv-1'),
      listForVariant: jest.fn(),
    };
    lockedRow = null;
    savedRow = null;

    const makeManager = () => ({
      getRepository: () => ({
        createQueryBuilder: jest.fn(() => ({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(lockedRow),
        })),
        save: jest.fn().mockImplementation((r) => {
          savedRow = r;
          return Promise.resolve(r);
        }),
      }),
    });

    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
      query: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryOrmEntity), useValue: inventory },
        { provide: DataSource, useValue: dataSource },
        { provide: MovementService, useValue: movements },
        { provide: LowStockAlertService, useValue: { evaluate: jest.fn() } },
      ],
    }).compile();
    service = module.get(InventoryService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should resolve unknown variant ids to out_of_stock in the batch read (FR-INV-004)', async () => {
    inventory.find.mockResolvedValue([
      { variantId: 'v1', available: 12, lowStockThreshold: 3 },
    ]);
    const result = await service.batchAvailability(['v1', 'v-missing']);
    expect(result.v1).toEqual({ available: 12, status: StockStatus.IN_STOCK });
    expect(result['v-missing']).toEqual({ available: 0, status: StockStatus.OUT_OF_STOCK });
  });

  it('should receive stock, recompute available, and write a real movement (FR-INV-010/050)', async () => {
    lockedRow = { variantId: 'v1', onHand: 2, reserved: 0, available: 2, lowStockThreshold: 3 };
    const result = await service.receive('v1', 50, 'supplier_delivery', ADMIN_ACTOR);
    expect(result.on_hand).toBe(52);
    expect(result.available).toBe(52);
    expect(result.movement_id).toBe('mv-1');
    expect(movements.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'receive', quantityDelta: 50, resultingOnHand: 52 }),
    );
  });

  it('should reject receive with quantity <= 0 (FR-INV-010)', async () => {
    await expect(service.receive('v1', 0, 'x', ADMIN_ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject receive with a missing reason', async () => {
    await expect(service.receive('v1', 5, '  ', ADMIN_ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject adjust with quantity_delta == 0 (FR-INV-011)', async () => {
    await expect(service.adjust('v1', 0, 'x', ADMIN_ACTOR)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should apply a negative adjust that stays >= 0 and writes a movement (FR-INV-012/050)', async () => {
    lockedRow = { variantId: 'v1', onHand: 5, reserved: 0, available: 5, lowStockThreshold: 3 };
    const result = await service.adjust('v1', -2, 'damaged', ADMIN_ACTOR);
    expect(result.on_hand).toBe(3);
    expect(result.available).toBe(3);
    expect(result.movement_id).toBe('mv-1');
  });

  it('should reject an adjust that would make on_hand negative → NEGATIVE_ON_HAND (BR-INV-2)', async () => {
    lockedRow = { variantId: 'v1', onHand: 2, reserved: 0, available: 2, lowStockThreshold: 3 };
    await expect(service.adjust('v1', -5, 'damaged', ADMIN_ACTOR)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(savedRow).toBeNull(); // row unchanged
    expect(movements.recordMovement).not.toHaveBeenCalled(); // no ledger row on rejection
  });

  it('should 404 when receiving against a non-existent record', async () => {
    lockedRow = null;
    await expect(service.receive('missing', 5, 'x', ADMIN_ACTOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should set the threshold (FR-INV-013)', async () => {
    lockedRow = { variantId: 'v1', onHand: 10, reserved: 0, available: 10, lowStockThreshold: 0 };
    const result = await service.setThreshold('v1', 5);
    expect(result.variant_id).toBe('v1');
    expect(savedRow?.lowStockThreshold).toBe(5);
  });

  it('should reject a negative threshold', async () => {
    await expect(service.setThreshold('v1', -1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
