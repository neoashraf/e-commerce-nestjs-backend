import { Inject, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { InventoryOrmEntity } from '../infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import {
  IInventoryNotifier,
  INVENTORY_NOTIFIER,
} from './ports/inventory-notifier.port';

/**
 * Low-stock alerting (SRS 11 §5.5, FR-INV-040/041/042; BR-INV-9; §12.7/§12.10). A single shared hook
 * the stock-change path calls after any inventory-row save: it compares the post-change `available`
 * against the SKU's `low_stock_threshold` and, on a fresh threshold-crossing, raises
 * `inventory.low_stock_alert` via the NOTIF port and stamps `last_alert_at`. `last_alert_at` is the
 * debounce flag — non-null means "already alerted, suppress"; it is cleared (re-armed) when `available`
 * recovers above the threshold, so the next drop alerts again (exactly one alert per crossing).
 *
 * `evaluate` runs INSIDE the caller's transaction (it takes that `EntityManager`) and re-reads the row
 * the caller just locked + saved, so the debounce state commits atomically with the stock change. The
 * NOTIF dispatch goes through a non-throwing port — an alert delivery failure never affects the stock
 * change. FR-INV-042 (low/out list) is satisfied by the existing `GET /admin/inventory?status=` filter
 * (inv-stock-be); no new endpoint here.
 */
@Injectable()
export class LowStockAlertService {
  private readonly logger = new Logger(LowStockAlertService.name);

  constructor(
    @Inject(INVENTORY_NOTIFIER) private readonly notifier: IInventoryNotifier,
  ) {}

  /**
   * Evaluate the alert/debounce/re-arm state for a variant after a stock change. Call this once, inside
   * the caller's transaction, immediately after saving the inventory row. No-op for callers whose change
   * cannot affect availability. Variant rows with a zero threshold have no low-stock band, so they never
   * alert (FR-INV-041 note; SRS §16 default-threshold open question).
   */
  async evaluate(manager: EntityManager, variantId: string): Promise<void> {
    const repo = manager.getRepository(InventoryOrmEntity);
    const row = await repo.findOne({ where: { variantId } });
    if (!row) return;

    const threshold = row.lowStockThreshold;
    const available = row.available;

    // Recovery: available is back above the band → re-arm so the next crossing alerts (FR-INV-041).
    if (available > threshold) {
      if (row.lastAlertAt !== null) {
        row.lastAlertAt = null;
        await repo.save(row);
      }
      return;
    }

    // At/below threshold. A zero threshold means no low-stock band (do not alert).
    if (threshold <= 0) return;

    // Debounce: already in an alerted state → suppress (one alert per crossing, BR-INV-9, §12.7).
    if (row.lastAlertAt !== null) return;

    // Fresh crossing → stamp the debounce flag (in-tx) then dispatch via the non-throwing port.
    row.lastAlertAt = new Date();
    await repo.save(row);

    const label = await this.loadLabel(manager, variantId);
    await this.notifier.notifyLowStock({
      variant_id: variantId,
      sku_code: label.skuCode,
      product_title: label.productTitle,
      available,
      threshold,
    });
  }

  /** Best-effort CAT label for the alert payload; degrades to nulls when CAT tables are unavailable. */
  private async loadLabel(
    manager: EntityManager,
    variantId: string,
  ): Promise<{ skuCode: string | null; productTitle: string | null }> {
    try {
      const rows = (await manager.query(
        `SELECT pv.sku_code AS sku_code, p.name AS product_title
           FROM "product_variants" pv
           LEFT JOIN "products" p ON p.id = pv.product_id
          WHERE pv.id = $1
          LIMIT 1`,
        [variantId],
      )) as { sku_code: string | null; product_title: string | null }[];
      if (rows.length === 0) return { skuCode: null, productTitle: null };
      return { skuCode: rows[0].sku_code, productTitle: rows[0].product_title };
    } catch {
      // CAT tables absent (graceful degrade, as in inv-stock-be's label join).
      return { skuCode: null, productTitle: null };
    }
  }
}
