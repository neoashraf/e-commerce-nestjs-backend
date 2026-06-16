import { Injectable } from '@nestjs/common';

import { InventoryView } from '../../../reports/domain/report-views';
import { GetInventoryReportUseCase } from '../../../reports/application/use-cases/get-inventory-report.use-case';
import {
  InventoryDashboardPort,
  StockAlertCounts,
} from '../../application/ports/inventory-dashboard.port';

/**
 * RPT-backed InventoryDashboardPort (FR-DASH-011). Low / out-of-stock SKU counts are the lengths of the
 * Inventory report's `low_stock` / `out_of_stock` level views (current snapshot) — single-sourced with
 * the Inventory report (BR-DASH-2). Delegates into the RPT application layer.
 */
@Injectable()
export class InventoryDashboardRptAdapter implements InventoryDashboardPort {
  constructor(private readonly inventory: GetInventoryReportUseCase) {}

  async getStockAlertCounts(): Promise<StockAlertCounts> {
    const [low, out] = await Promise.all([
      this.inventory.levels(InventoryView.LOW_STOCK),
      this.inventory.levels(InventoryView.OUT_OF_STOCK),
    ]);
    return { low_stock_skus: low.length, out_of_stock_skus: out.length };
  }
}
