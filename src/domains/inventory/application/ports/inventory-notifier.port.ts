/** Payload for a low-stock alert (SRS 11 §5.5 FR-INV-040: SKU, product, current qty + threshold). */
export interface LowStockAlertPayload {
  variant_id: string;
  sku_code: string | null;
  product_title: string | null;
  available: number;
  threshold: number;
}

/**
 * Outbound port to the NOTIF module for inventory alerts. INV only **triggers** delivery
 * (`inventory.low_stock_alert`, FR-INV-040); the template + delivery are owned by NOTIF
 * ([notif-dispatch-be](../../../09-notifications/notif-dispatch-be.md)). Wrapped behind this port so the
 * alert slice builds before NOTIF is wired; the stub logs. Integration point: replace the stub binding
 * in `inventory.module.ts` with a NOTIF-backed adapter once `notif-dispatch-be` exposes its dispatcher.
 * Implementations MUST NOT throw — a notification failure must never roll back a stock change.
 */
export interface IInventoryNotifier {
  /** Raise a low-stock alert for a SKU that crossed its threshold (FR-INV-040). */
  notifyLowStock(payload: LowStockAlertPayload): Promise<void>;
}

export const INVENTORY_NOTIFIER = Symbol('IInventoryNotifier');
