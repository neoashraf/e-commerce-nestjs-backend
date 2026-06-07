import { Injectable } from '@nestjs/common';

import {
  InventoryDashboardPort,
  StockAlertCounts,
} from '../../application/ports/inventory-dashboard.port';

/**
 * INV read-port stub (FR-DASH-011). Representative low/out-of-stock counts.
 *
 * TODO-INTEGRATION (INV): replace with a real adapter over the Inventory module read side —
 * count SKUs at/under their low-stock threshold and at zero qty.
 */
@Injectable()
export class InventoryDashboardStubAdapter implements InventoryDashboardPort {
  async getStockAlertCounts(): Promise<StockAlertCounts> {
    return { low_stock_skus: 9, out_of_stock_skus: 3 };
  }
}
