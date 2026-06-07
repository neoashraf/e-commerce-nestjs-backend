/**
 * Dashboard widget catalog + permission backing (SRS 10 §5.4 FR-DASH-030, BR-DASH-4, §12.2).
 *
 * Each widget renders only when the signed-in admin holds (one of) the permission code(s)
 * backing it. `meta.visible_widgets` is the intersection of this catalog and the admin's
 * effective permissions; widgets the admin cannot see are omitted from `data`. Permission
 * codes are the RBAC catalog codes (see `rbac/domain/permission-catalog.ts`).
 */

/** Canonical widget keys surfaced in `meta.visible_widgets` (matches the API contract). */
export enum DashboardWidget {
  KPIS = 'kpis',
  ALERTS = 'alerts',
  BREAKDOWNS = 'breakdowns',
  RECENT_ORDERS = 'recent_orders',
  RECENT_CUSTOMERS = 'recent_customers',
  RECENT_LEADS = 'recent_leads',
}

/** RBAC permission codes consumed by the dashboard (subset of the fixed catalog). */
export const DASH_PERMISSIONS = {
  reportsView: 'reports.report.view',
  ordersRead: 'orders.order.read',
  inventoryRead: 'inventory.stock.read',
  leadsRead: 'leads.lead.read',
  customersRead: 'customers.customer.read',
} as const;

/**
 * Widget → backing permission codes. A widget is visible when the admin holds **any** of its
 * codes (the `alerts` widget aggregates order/stock/lead signals, so any one unlocks it; its
 * contents are then further filtered per sub-permission — §12.2).
 */
export const WIDGET_CATALOG: Record<DashboardWidget, readonly string[]> = {
  [DashboardWidget.KPIS]: [DASH_PERMISSIONS.reportsView],
  [DashboardWidget.ALERTS]: [
    DASH_PERMISSIONS.ordersRead,
    DASH_PERMISSIONS.inventoryRead,
    DASH_PERMISSIONS.leadsRead,
  ],
  [DashboardWidget.BREAKDOWNS]: [DASH_PERMISSIONS.reportsView],
  [DashboardWidget.RECENT_ORDERS]: [DASH_PERMISSIONS.ordersRead],
  [DashboardWidget.RECENT_CUSTOMERS]: [DASH_PERMISSIONS.customersRead],
  [DashboardWidget.RECENT_LEADS]: [DASH_PERMISSIONS.leadsRead],
};

/** Every widget key that exists (used to validate preference references — §11). */
export const ALL_WIDGET_KEYS: string[] = Object.values(DashboardWidget);
const WIDGET_KEY_SET = new Set(ALL_WIDGET_KEYS);

export function isKnownWidgetKey(key: string): boolean {
  return WIDGET_KEY_SET.has(key);
}

/** Whether the holder's permission set unlocks a given widget (any backing code present). */
export function canSeeWidget(widget: DashboardWidget, held: ReadonlySet<string>): boolean {
  return WIDGET_CATALOG[widget].some((code) => held.has(code));
}

/** The permission-filtered, catalog-ordered visible widget keys for a holder (FR-DASH-030). */
export function visibleWidgets(held: ReadonlySet<string>): DashboardWidget[] {
  return Object.values(DashboardWidget).filter((w) => canSeeWidget(w, held));
}
