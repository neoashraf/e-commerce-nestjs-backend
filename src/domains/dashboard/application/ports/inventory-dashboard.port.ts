/** Stock alert counts (FR-DASH-011). */
export interface StockAlertCounts {
  low_stock_skus: number;
  out_of_stock_skus: number;
}

/**
 * INV read port (FR-DASH-011). Low-stock and out-of-stock SKU counts (current state). Real impl
 * integrates with the Inventory module read side. See the stub adapter for the representative
 * implementation pending wiring.
 */
export interface InventoryDashboardPort {
  getStockAlertCounts(): Promise<StockAlertCounts>;
}

export const INVENTORY_DASHBOARD_PORT = Symbol('DashboardInventoryPort');
