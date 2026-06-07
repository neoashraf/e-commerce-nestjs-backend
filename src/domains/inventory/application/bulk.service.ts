import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { StockMovementType } from '../domain/stock-movement-type';
import { InventoryOrmEntity } from '../infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { LowStockAlertService } from './low-stock-alert.service';
import { MovementActor, MovementService } from './movement.service';

/** One normalized bulk row (JSON body or a parsed CSV line). */
export interface BulkRow {
  sku_code: string;
  set_on_hand: number;
  low_stock_threshold?: number | null;
  reason: string;
}

/** One per-row failure in the results report (contract: Bulk update / import `errors[]`). */
export interface BulkRowError {
  row: number;
  sku_code: string;
  error: string;
}

/** Bulk results report (contract: Bulk update / import response `data`). */
export interface BulkResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: BulkRowError[];
}

/**
 * Bulk stock + threshold import (FR-INV-014; SRS 11 §11 bulk-import row rule, §12.9). Accepts a batch
 * of rows (JSON or parsed CSV) keyed by `sku_code`, validates each row independently, applies the valid
 * ones, and reports a per-row results report. `set_on_hand` is **absolute**: it is applied as a
 * `correction` movement with the signed delta (`set_on_hand − current_on_hand`) so the append-only
 * ledger stays consistent (one movement per applied set, BR-INV-6). The batch **continues on error**
 * (FR-INV-014, §12.9): an invalid row is reported, never aborting the rest; a per-row apply runs in its
 * own transaction so one failure does not roll back already-applied rows. The structure isolates the
 * apply step so an all-or-nothing mode (Open Q) could later wrap the whole batch in one transaction.
 */
@Injectable()
export class BulkService {
  constructor(
    @InjectRepository(InventoryOrmEntity)
    private readonly inventory: Repository<InventoryOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly movements: MovementService,
    private readonly alerts: LowStockAlertService,
  ) {}

  async bulkUpdate(rows: BulkRow[], actor: MovementActor): Promise<BulkResult> {
    const errors: BulkRowError[] = [];
    let succeeded = 0;

    // Resolve all referenced sku_codes once to a sku_code → variant_id map (continue-on-error means we
    // never abort the batch; an unresolved sku is a per-row `unknown_sku` error).
    const skuToVariant = await this.resolveSkuCodes(rows.map((r) => r.sku_code));

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1; // 1-based for the report (header is not a data row)
      const row = rows[i];
      const sku = (row.sku_code ?? '').trim();

      // --- per-row validation (FR-INV-014, §11) ---
      if (sku === '') {
        errors.push({ row: rowNumber, sku_code: sku, error: 'missing_sku_code' });
        continue;
      }
      if (!Number.isInteger(row.set_on_hand) || row.set_on_hand < 0) {
        errors.push({ row: rowNumber, sku_code: sku, error: 'invalid_set_on_hand' });
        continue;
      }
      if (
        row.low_stock_threshold !== undefined &&
        row.low_stock_threshold !== null &&
        (!Number.isInteger(row.low_stock_threshold) || row.low_stock_threshold < 0)
      ) {
        errors.push({ row: rowNumber, sku_code: sku, error: 'invalid_threshold' });
        continue;
      }
      if (!row.reason || row.reason.trim() === '') {
        errors.push({ row: rowNumber, sku_code: sku, error: 'missing_reason' });
        continue;
      }
      const variantId = skuToVariant.get(sku);
      if (!variantId) {
        errors.push({ row: rowNumber, sku_code: sku, error: 'unknown_sku' });
        continue;
      }

      // --- apply the row (its own transaction; continue-on-error) ---
      try {
        await this.applyRow(variantId, row, actor);
        succeeded += 1;
      } catch (err) {
        errors.push({ row: rowNumber, sku_code: sku, error: this.toRowError(err) });
      }
    }

    return {
      processed: rows.length,
      succeeded,
      failed: errors.length,
      errors,
    };
  }

  /**
   * Apply one validated row inside a row-locked transaction: set `on_hand` to the absolute target via a
   * signed `correction` movement (delta = target − current), set the threshold when provided, and write
   * the ledger movement in the SAME transaction (BR-INV-6). A would-be-negative target is impossible
   * here (validation forces `set_on_hand ≥ 0`), but the invariant is still asserted (BR-INV-2).
   */
  private async applyRow(
    variantId: string,
    row: BulkRow,
    actor: MovementActor,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(InventoryOrmEntity);
      const record = await repo
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.variant_id = :variantId', { variantId })
        .getOne();
      if (!record) {
        throw new RowApplyError('no_inventory_record');
      }

      const target = row.set_on_hand;
      if (target < 0) {
        throw new RowApplyError('would_be_negative');
      }
      const delta = target - record.onHand;

      if (row.low_stock_threshold !== undefined && row.low_stock_threshold !== null) {
        record.lowStockThreshold = row.low_stock_threshold;
      }
      record.onHand = target;
      record.available = target - record.reserved;
      await repo.save(record);

      // A set that does not change on_hand still records the threshold change but writes no quantity
      // movement (a zero-delta `correction` would be a meaningless ledger entry, FR-INV-050).
      if (delta !== 0) {
        await this.movements.recordMovement(manager, {
          type: StockMovementType.CORRECTION,
          variantId,
          quantityDelta: delta,
          resultingOnHand: target,
          reason: row.reason,
          actor,
        });
      }

      // Alert/debounce/re-arm hook: a bulk set can drop available below (or recover it above) the
      // threshold, including a threshold-only change (FR-INV-040/041; shared path).
      await this.alerts.evaluate(manager, variantId);
    });
  }

  /** Map each known sku_code to its variant id; unknown/duplicate-safe via the unique sku_code index. */
  private async resolveSkuCodes(skuCodes: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(
      new Set(skuCodes.map((s) => (s ?? '').trim()).filter((s) => s !== '')),
    );
    if (unique.length === 0) return map;
    if (!(await this.tableExists('product_variants'))) return map;

    const rows = await this.dataSource.query(
      `SELECT id, sku_code FROM "product_variants" WHERE sku_code = ANY($1) AND deleted_at IS NULL`,
      [unique],
    );
    for (const r of rows as { id: string; sku_code: string }[]) {
      map.set(r.sku_code, r.id);
    }
    return map;
  }

  private toRowError(err: unknown): string {
    if (err instanceof RowApplyError) return err.code;
    return 'apply_failed';
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }
}

/** Internal per-row apply failure carrying the report `error` code. */
class RowApplyError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'RowApplyError';
  }
}
