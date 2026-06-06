import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { BulkRow, BulkService } from '../bulk.service';
import { MovementService } from '../movement.service';
import { StockMovementActorType, StockMovementType } from '../../domain/stock-movement-type';
import { InventoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/inventory.orm-entity';

const ADMIN_ACTOR = { type: StockMovementActorType.ADMIN, id: 'admin-1' };

/** Mutable inventory record returned by the row-lock query inside each per-row transaction. */
interface FakeRecord {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
}

describe('Inventory — BulkService', () => {
  let service: BulkService;
  let movements: { recordMovement: jest.Mock };
  let records: Map<string, FakeRecord>;
  let savedRecords: FakeRecord[];
  let skuRows: { id: string; sku_code: string }[];
  let productVariantsExists: boolean;

  const buildRow = (o: Partial<BulkRow> = {}): BulkRow => ({
    sku_code: 'SKU-1',
    set_on_hand: 30,
    low_stock_threshold: 5,
    reason: 'stock_take',
    ...o,
  });

  beforeEach(async () => {
    movements = { recordMovement: jest.fn().mockResolvedValue('mv-x') };
    records = new Map<string, FakeRecord>();
    savedRecords = [];
    skuRows = [];
    productVariantsExists = true;

    const makeManager = () => ({
      getRepository: () => ({
        createQueryBuilder: jest.fn(() => {
          let variantId = '';
          return {
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockImplementation((_clause: string, params: { variantId: string }) => {
              variantId = params.variantId;
              return {
                getOne: jest.fn().mockResolvedValue(records.get(variantId) ?? null),
              };
            }),
          };
        }),
        save: jest.fn().mockImplementation((r: FakeRecord) => {
          savedRecords.push({ ...r });
          records.set(r.variantId, r);
          return Promise.resolve(r);
        }),
      }),
    });

    const dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(makeManager())),
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('information_schema.tables')) {
          return Promise.resolve(productVariantsExists ? [{ '?column?': 1 }] : []);
        }
        if (sql.includes('product_variants')) {
          return Promise.resolve(skuRows);
        }
        return Promise.resolve([]);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkService,
        { provide: getRepositoryToken(InventoryOrmEntity), useValue: {} },
        { provide: DataSource, useValue: dataSource },
        { provide: MovementService, useValue: movements },
      ],
    }).compile();
    service = module.get(BulkService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should apply a valid row as a correction movement with the signed delta (FR-INV-014, BR-INV-6)', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 10, reserved: 2, available: 8, lowStockThreshold: 0 });

    const result = await service.bulkUpdate([buildRow({ sku_code: 'SKU-1', set_on_hand: 30 })], ADMIN_ACTOR);

    expect(result).toMatchObject({ processed: 1, succeeded: 1, failed: 0, errors: [] });
    expect(movements.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: StockMovementType.CORRECTION,
        variantId: 'v1',
        quantityDelta: 20, // 30 - 10
        resultingOnHand: 30,
        reason: 'stock_take',
      }),
    );
    const saved = savedRecords[0];
    expect(saved.onHand).toBe(30);
    expect(saved.available).toBe(28); // 30 - reserved 2
    expect(saved.lowStockThreshold).toBe(5);
  });

  it('should set on_hand absolutely (set, not add)', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 100, reserved: 0, available: 100, lowStockThreshold: 0 });

    await service.bulkUpdate([buildRow({ sku_code: 'SKU-1', set_on_hand: 30 })], ADMIN_ACTOR);

    expect(savedRecords[0].onHand).toBe(30);
    expect(movements.recordMovement).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantityDelta: -70, resultingOnHand: 30 }),
    );
  });

  it('should report unknown_sku and continue with valid rows (FR-INV-014, §12.9)', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 5, reserved: 0, available: 5, lowStockThreshold: 0 });

    const result = await service.bulkUpdate(
      [buildRow({ sku_code: 'SKU-1', set_on_hand: 10 }), buildRow({ sku_code: 'GHOST', set_on_hand: 7 })],
      ADMIN_ACTOR,
    );

    expect(result).toMatchObject({ processed: 2, succeeded: 1, failed: 1 });
    expect(result.errors).toEqual([{ row: 2, sku_code: 'GHOST', error: 'unknown_sku' }]);
  });

  it('should report invalid_set_on_hand for a non-integer/negative quantity', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 5, reserved: 0, available: 5, lowStockThreshold: 0 });

    const result = await service.bulkUpdate(
      [
        buildRow({ sku_code: 'SKU-1', set_on_hand: Number.NaN }),
        buildRow({ sku_code: 'SKU-1', set_on_hand: -3 }),
      ],
      ADMIN_ACTOR,
    );

    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors.map((e) => e.error)).toEqual(['invalid_set_on_hand', 'invalid_set_on_hand']);
    expect(movements.recordMovement).not.toHaveBeenCalled();
  });

  it('should report missing_reason when reason is blank', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 5, reserved: 0, available: 5, lowStockThreshold: 0 });

    const result = await service.bulkUpdate([buildRow({ reason: '   ' })], ADMIN_ACTOR);

    expect(result.errors).toEqual([{ row: 1, sku_code: 'SKU-1', error: 'missing_reason' }]);
  });

  it('should report invalid_threshold for a negative threshold', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 5, reserved: 0, available: 5, lowStockThreshold: 0 });

    const result = await service.bulkUpdate([buildRow({ low_stock_threshold: -1 })], ADMIN_ACTOR);

    expect(result.errors).toEqual([{ row: 1, sku_code: 'SKU-1', error: 'invalid_threshold' }]);
  });

  it('should write no movement when set_on_hand equals current on_hand but still apply the threshold', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    records.set('v1', { variantId: 'v1', onHand: 30, reserved: 0, available: 30, lowStockThreshold: 0 });

    const result = await service.bulkUpdate(
      [buildRow({ sku_code: 'SKU-1', set_on_hand: 30, low_stock_threshold: 9 })],
      ADMIN_ACTOR,
    );

    expect(result.succeeded).toBe(1);
    expect(movements.recordMovement).not.toHaveBeenCalled();
    expect(savedRecords[0].lowStockThreshold).toBe(9);
  });

  it('should report no_inventory_record when the variant has no inventory row', async () => {
    skuRows = [{ id: 'v1', sku_code: 'SKU-1' }];
    // no record seeded for v1

    const result = await service.bulkUpdate([buildRow({ sku_code: 'SKU-1' })], ADMIN_ACTOR);

    expect(result.errors).toEqual([{ row: 1, sku_code: 'SKU-1', error: 'no_inventory_record' }]);
  });

  it('should treat all rows as unknown_sku when CAT variants table is absent (graceful degrade)', async () => {
    productVariantsExists = false;

    const result = await service.bulkUpdate([buildRow({ sku_code: 'SKU-1' })], ADMIN_ACTOR);

    expect(result).toMatchObject({ processed: 1, succeeded: 0, failed: 1 });
    expect(result.errors[0].error).toBe('unknown_sku');
  });
});
