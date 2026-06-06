import { Inject, Injectable, Logger } from '@nestjs/common';

import { DashboardPeriod } from '../../domain/dashboard-period';
import {
  CountKpi,
  DashboardAlerts,
  DashboardBreakdowns,
  DashboardKpis,
  FullDashboardSummary,
  KpiDirection,
  MoneyKpi,
  PeriodView,
  RecentCustomer,
  RecentLead,
  RecentOrder,
} from '../../domain/summary.types';
import {
  DASH_PERMISSIONS,
  DashboardWidget,
  visibleWidgets,
} from '../../domain/widget-catalog';
import {
  REPORTS_METRICS_PORT,
  ReportsMetricsPort,
} from '../ports/reports-metrics.port';
import {
  ORDERS_DASHBOARD_PORT,
  OrdersDashboardPort,
} from '../ports/orders-dashboard.port';
import {
  PAYMENTS_DASHBOARD_PORT,
  PaymentsDashboardPort,
} from '../ports/payments-dashboard.port';
import {
  INVENTORY_DASHBOARD_PORT,
  InventoryDashboardPort,
} from '../ports/inventory-dashboard.port';
import {
  CUSTOMERS_DASHBOARD_PORT,
  CustomersDashboardPort,
} from '../ports/customers-dashboard.port';
import {
  LEADS_DASHBOARD_PORT,
  LeadsDashboardPort,
} from '../ports/leads-dashboard.port';
import { DashboardCacheService } from './dashboard-cache.service';

const TOP_PRODUCTS_LIMIT = 5;

/** A permission-filtered summary ready for the response envelope. */
export interface ComposedSummary {
  data: Record<string, unknown>;
  visibleWidgets: string[];
}

/** Recent-activity stream selector (contract: `type` ∈ orders | customers | leads). */
export type ActivityType = 'orders' | 'customers' | 'leads';

/**
 * Read-only dashboard composition (SRS 10 §5, BR-DASH-1/2/6, §12.7). Assembles KPIs (+ deltas vs
 * the preceding equal period), operational alerts, and breakdowns from the owning modules via read
 * ports; caches the unfiltered aggregate with an `as_of`; and filters widgets/sub-counts to the
 * admin's permissions on read (FR-DASH-030). A failing source degrades only its widget — never the
 * whole page (§12.7).
 */
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @Inject(REPORTS_METRICS_PORT) private readonly reports: ReportsMetricsPort,
    @Inject(ORDERS_DASHBOARD_PORT) private readonly orders: OrdersDashboardPort,
    @Inject(PAYMENTS_DASHBOARD_PORT) private readonly payments: PaymentsDashboardPort,
    @Inject(INVENTORY_DASHBOARD_PORT) private readonly inventory: InventoryDashboardPort,
    @Inject(CUSTOMERS_DASHBOARD_PORT) private readonly customers: CustomersDashboardPort,
    @Inject(LEADS_DASHBOARD_PORT) private readonly leads: LeadsDashboardPort,
    private readonly cache: DashboardCacheService,
  ) {}

  /** Permission-filtered summary for an admin, served from cache when fresh (FR-DASH-031). */
  async getSummary(period: DashboardPeriod, held: ReadonlySet<string>): Promise<ComposedSummary> {
    const key = period.cacheKey();
    let summary = this.cache.get(key);
    if (!summary) {
      summary = await this.compose(period);
      this.cache.set(key, summary);
    }
    return this.filterForPermissions(summary, held);
  }

  /** Recent activity of a given type (FR-DASH-020/021). Caller enforces per-type permission. */
  async getActivity(
    type: ActivityType,
    limit: number,
  ): Promise<RecentOrder[] | RecentCustomer[] | RecentLead[]> {
    switch (type) {
      case 'orders':
        return this.orders.getRecentOrders(limit);
      case 'customers':
        return this.customers.getRecentCustomers(limit);
      case 'leads':
        return this.leads.getRecentLeads(limit);
      default:
        return [];
    }
  }

  /** Force a recompute for the period and return the new freshness stamp (FR-DASH-032). */
  async refresh(period: DashboardPeriod): Promise<{ as_of: string }> {
    const key = period.cacheKey();
    this.cache.invalidate(key);
    const summary = await this.compose(period);
    this.cache.set(key, summary);
    return { as_of: summary.as_of };
  }

  /** Build the full unfiltered summary, degrading any failing source to a null widget (§12.7). */
  private async compose(period: DashboardPeriod): Promise<FullDashboardSummary> {
    const [kpis, alerts, breakdowns] = await Promise.all([
      this.computeKpis(period),
      this.computeAlerts(),
      this.computeBreakdowns(period),
    ]);
    return {
      period: this.toPeriodView(period),
      kpis,
      alerts,
      breakdowns,
      as_of: new Date().toISOString(),
    };
  }

  private async computeKpis(period: DashboardPeriod): Promise<DashboardKpis | null> {
    return this.safe('kpis', async () => {
      const [sales, salesPrev, orders, ordersPrev, newCust, newCustPrev] = await Promise.all([
        this.payments.getRevenue(period.range),
        this.payments.getRevenue(period.compare),
        this.orders.getOrderCount(period.range),
        this.orders.getOrderCount(period.compare),
        this.customers.getNewCustomerCount(period.range),
        this.customers.getNewCustomerCount(period.compare),
      ]);
      const aov = orders > 0 ? sales / orders : 0;
      const aovPrev = ordersPrev > 0 ? salesPrev / ordersPrev : 0;
      return {
        sales: this.money(sales, salesPrev),
        orders: this.count(orders, ordersPrev),
        avg_order_value: this.money(aov, aovPrev),
        new_customers: this.count(newCust, newCustPrev),
      };
    });
  }

  private async computeAlerts(): Promise<DashboardAlerts | null> {
    const [actions, stock, newLeads] = await Promise.all([
      this.safe('alerts.orders', () => this.orders.getActionCounts()),
      this.safe('alerts.inventory', () => this.inventory.getStockAlertCounts()),
      this.safe('alerts.leads', () => this.leads.getNewLeadCount()),
    ]);
    if (!actions && !stock && newLeads === null) return null;
    const alerts: DashboardAlerts = {};
    if (actions) {
      alerts.orders_pending_payment = actions.orders_pending_payment;
      alerts.orders_to_process = actions.orders_to_process;
      alerts.orders_to_ship = actions.orders_to_ship;
    }
    if (stock) {
      alerts.low_stock_skus = stock.low_stock_skus;
      alerts.out_of_stock_skus = stock.out_of_stock_skus;
    }
    if (newLeads !== null) alerts.new_leads = newLeads;
    return alerts;
  }

  private async computeBreakdowns(period: DashboardPeriod): Promise<DashboardBreakdowns | null> {
    const [trend, ordersByStatus, paymentSplit, topProducts] = await Promise.all([
      this.safe('breakdowns.trend', () => this.reports.getTrend(period.range)),
      this.safe('breakdowns.orders_by_status', () => this.orders.getOrdersByStatus(period.range)),
      this.safe('breakdowns.payment_split', () => this.payments.getPaymentSplit(period.range)),
      this.safe('breakdowns.top_products', () =>
        this.reports.getTopProducts(period.range, TOP_PRODUCTS_LIMIT),
      ),
    ]);
    if (!trend && !ordersByStatus && !paymentSplit && !topProducts) return null;
    return {
      trend: trend ?? [],
      orders_by_status: ordersByStatus ?? {},
      payment_split: paymentSplit ?? {},
      top_products: topProducts ?? [],
    };
  }

  /** Filter the cached summary to the widgets/sub-counts the admin may see (FR-DASH-030, §12.2). */
  private filterForPermissions(summary: FullDashboardSummary, held: ReadonlySet<string>): ComposedSummary {
    const visible = visibleWidgets(held);
    const visibleSet = new Set(visible);
    const data: Record<string, unknown> = {
      period: summary.period,
      as_of: summary.as_of,
    };

    if (visibleSet.has(DashboardWidget.KPIS)) data.kpis = summary.kpis;
    if (visibleSet.has(DashboardWidget.BREAKDOWNS)) data.breakdowns = summary.breakdowns;
    if (visibleSet.has(DashboardWidget.ALERTS) && summary.alerts) {
      data.alerts = this.filterAlerts(summary.alerts, held);
    }

    return { data, visibleWidgets: visible };
  }

  private filterAlerts(alerts: DashboardAlerts, held: ReadonlySet<string>): DashboardAlerts {
    const out: DashboardAlerts = {};
    if (held.has(DASH_PERMISSIONS.ordersRead)) {
      out.orders_pending_payment = alerts.orders_pending_payment;
      out.orders_to_process = alerts.orders_to_process;
      out.orders_to_ship = alerts.orders_to_ship;
    }
    if (held.has(DASH_PERMISSIONS.inventoryRead)) {
      out.low_stock_skus = alerts.low_stock_skus;
      out.out_of_stock_skus = alerts.out_of_stock_skus;
    }
    if (held.has(DASH_PERMISSIONS.leadsRead)) {
      out.new_leads = alerts.new_leads;
    }
    return out;
  }

  private toPeriodView(period: DashboardPeriod): PeriodView {
    return {
      preset: period.preset,
      from: period.range.from,
      to: period.range.to,
      compare_from: period.compare.from,
      compare_to: period.compare.to,
    };
  }

  private money(current: number, prior: number): MoneyKpi {
    const { delta_pct, direction } = this.delta(current, prior);
    return { value: current.toFixed(2), currency: 'BDT', delta_pct, direction };
  }

  private count(current: number, prior: number): CountKpi {
    const { delta_pct, direction } = this.delta(current, prior);
    return { value: Math.round(current), delta_pct, direction };
  }

  /** Period-over-period delta; `null` when the prior period is empty (§12.3 — show "—"). */
  private delta(current: number, prior: number): { delta_pct: number | null; direction: KpiDirection } {
    if (prior <= 0) {
      return { delta_pct: null, direction: current > 0 ? 'up' : 'flat' };
    }
    const pct = Math.round(((current - prior) / prior) * 1000) / 10;
    const direction: KpiDirection = current > prior ? 'up' : current < prior ? 'down' : 'flat';
    return { delta_pct: pct, direction };
  }

  /** Run a source read, degrading a failure to `null` and logging it (resilience — §12.7). */
  private async safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Dashboard source "${label}" failed; widget degraded: ${message}`);
      return null;
    }
  }
}
