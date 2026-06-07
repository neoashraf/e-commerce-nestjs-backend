import { Test, TestingModule } from '@nestjs/testing';

import { LowStockAlertService } from '../low-stock-alert.service';
import {
  IInventoryNotifier,
  INVENTORY_NOTIFIER,
} from '../ports/inventory-notifier.port';

/** Mutable inventory row the in-tx evaluate re-reads + saves. */
interface FakeRow {
  variantId: string;
  available: number;
  lowStockThreshold: number;
  lastAlertAt: Date | null;
}

describe('Inventory — LowStockAlertService', () => {
  let service: LowStockAlertService;
  let notifier: { notifyLowStock: jest.Mock };
  let row: FakeRow | null;
  let saved: FakeRow[];

  const makeManager = () => ({
    getRepository: () => ({
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn().mockImplementation((r: FakeRow) => {
        saved.push({ ...r });
        return Promise.resolve(r);
      }),
    }),
    query: jest.fn().mockResolvedValue([{ sku_code: 'PRED-BLK-43', product_title: 'Predator' }]),
  });

  beforeEach(async () => {
    notifier = { notifyLowStock: jest.fn().mockResolvedValue(undefined) };
    row = null;
    saved = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LowStockAlertService,
        { provide: INVENTORY_NOTIFIER, useValue: notifier as IInventoryNotifier },
      ],
    }).compile();
    service = module.get(LowStockAlertService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should alert and stamp last_alert_at on a fresh crossing to/below threshold (FR-INV-040)', async () => {
    row = { variantId: 'v1', available: 2, lowStockThreshold: 3, lastAlertAt: null };

    await service.evaluate(makeManager() as never, 'v1');

    expect(notifier.notifyLowStock).toHaveBeenCalledWith(
      expect.objectContaining({ variant_id: 'v1', available: 2, threshold: 3, sku_code: 'PRED-BLK-43' }),
    );
    expect(saved[0].lastAlertAt).toBeInstanceOf(Date);
  });

  it('should NOT re-alert while already in an alerted state (debounce, FR-INV-041/BR-INV-9)', async () => {
    row = { variantId: 'v1', available: 1, lowStockThreshold: 3, lastAlertAt: new Date() };

    await service.evaluate(makeManager() as never, 'v1');

    expect(notifier.notifyLowStock).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });

  it('should re-arm (clear last_alert_at) when available recovers above threshold (FR-INV-041)', async () => {
    row = { variantId: 'v1', available: 10, lowStockThreshold: 3, lastAlertAt: new Date() };

    await service.evaluate(makeManager() as never, 'v1');

    expect(saved[0].lastAlertAt).toBeNull();
    expect(notifier.notifyLowStock).not.toHaveBeenCalled();
  });

  it('should alert again on the next crossing after a recovery (one alert per crossing, §12.7)', async () => {
    // crossing 1
    row = { variantId: 'v1', available: 2, lowStockThreshold: 3, lastAlertAt: null };
    await service.evaluate(makeManager() as never, 'v1');
    // recovery
    row = { variantId: 'v1', available: 8, lowStockThreshold: 3, lastAlertAt: new Date() };
    await service.evaluate(makeManager() as never, 'v1');
    // crossing 2
    row = { variantId: 'v1', available: 1, lowStockThreshold: 3, lastAlertAt: null };
    await service.evaluate(makeManager() as never, 'v1');

    expect(notifier.notifyLowStock).toHaveBeenCalledTimes(2);
  });

  it('should not alert when threshold is zero (no low-stock band)', async () => {
    row = { variantId: 'v1', available: 0, lowStockThreshold: 0, lastAlertAt: null };

    await service.evaluate(makeManager() as never, 'v1');

    expect(notifier.notifyLowStock).not.toHaveBeenCalled();
  });

  it('should no-op when the variant has no inventory record', async () => {
    row = null;

    await service.evaluate(makeManager() as never, 'missing');

    expect(notifier.notifyLowStock).not.toHaveBeenCalled();
    expect(saved).toHaveLength(0);
  });
});
