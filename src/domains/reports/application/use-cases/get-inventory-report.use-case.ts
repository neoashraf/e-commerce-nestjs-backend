import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { InventoryView } from '../../domain/report-views';
import {
  IInventoryReadModel,
  INVENTORY_READ_MODEL,
  StockLevelRow,
} from '../ports/inventory-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/** Movement-summary payload (FR-RPT-031) with its freshness stamp. */
export interface MovementReport {
  received: number;
  sold: number;
  adjusted: number;
  restocked: number;
  as_of: string;
}

/**
 * Inventory report (FR-RPT-030/031). The `levels`/`low_stock`/`out_of_stock` views return current per-SKU
 * stock (point-in-time); `movement` summarises the period's ledger by type with an `as_of` stamp. Reads
 * INV through the port and serves from the aggregate cache (BR-RPT-7).
 */
@Injectable()
export class GetInventoryReportUseCase {
  constructor(
    @Inject(INVENTORY_READ_MODEL) private readonly inventory: IInventoryReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  /** Stock-level list views (current snapshot). `movement` is served by {@link movement}. */
  async levels(view: InventoryView): Promise<StockLevelRow[]> {
    const filter =
      view === InventoryView.LOW_STOCK
        ? 'low_stock'
        : view === InventoryView.OUT_OF_STOCK
          ? 'out_of_stock'
          : 'all';
    const cached = await this.cache.getOrCompute(`inventory:${filter}`, () =>
      this.inventory.getStockLevels(filter),
    );
    return cached.value;
  }

  /** Period movement summary grouped into received/sold/adjusted/restocked (FR-RPT-031). */
  async movement(period: ReportPeriod): Promise<MovementReport> {
    const range = { from: period.from, to: period.to };
    const cached = await this.cache.getOrCompute(
      `inventory:movement:${period.from}:${period.to}`,
      () => this.inventory.getMovementSummary(range),
    );
    return { ...cached.value, as_of: cached.asOf };
  }
}
