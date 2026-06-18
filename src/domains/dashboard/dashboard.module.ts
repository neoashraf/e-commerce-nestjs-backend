import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { ReportsModule } from '../reports/reports.module';
import { OrdersModule } from '../orders/orders.module';
import { REPORTS_METRICS_PORT } from './application/ports/reports-metrics.port';
import { ORDERS_DASHBOARD_PORT } from './application/ports/orders-dashboard.port';
import { PAYMENTS_DASHBOARD_PORT } from './application/ports/payments-dashboard.port';
import { INVENTORY_DASHBOARD_PORT } from './application/ports/inventory-dashboard.port';
import { CUSTOMERS_DASHBOARD_PORT } from './application/ports/customers-dashboard.port';
import { LEADS_DASHBOARD_PORT } from './application/ports/leads-dashboard.port';
import { ReportsMetricsRptAdapter } from './infrastructure/adapters/reports-metrics.rpt-adapter';
import { OrdersDashboardRptAdapter } from './infrastructure/adapters/orders-dashboard.rpt-adapter';
import { PaymentsDashboardRptAdapter } from './infrastructure/adapters/payments-dashboard.rpt-adapter';
import { InventoryDashboardRptAdapter } from './infrastructure/adapters/inventory-dashboard.rpt-adapter';
import { CustomersDashboardRptAdapter } from './infrastructure/adapters/customers-dashboard.rpt-adapter';
import { LeadsDashboardStubAdapter } from './infrastructure/adapters/leads-dashboard.stub-adapter';
import { DashboardPreferenceOrmEntity } from './infrastructure/persistence/typeorm/entities/dashboard-preference.orm-entity';
import { DashboardCacheService } from './application/services/dashboard-cache.service';
import { DashboardService } from './application/services/dashboard.service';
import { DashboardPreferencesService } from './application/services/dashboard-preferences.service';
import { DashboardController } from './presentation/controllers/dashboard.controller';

/**
 * Dashboard & Overview (DASH — FR-DASH-001–032). Read-only composition layer: it owns no business
 * data (BR-DASH-1/2), composing KPIs/alerts/breakdowns/activity from the owning modules via read
 * ports. RbacModule is imported (forwardRef, per the cross-module convention) for the admin JWT +
 * permission guards and `PermissionService` (widget-level permission filtering — FR-DASH-030).
 *
 * The **RPT-derivable** read ports (reports-metrics, payments, inventory, and the period-scoped
 * orders/customers KPIs) are bound to **real RPT-backed adapters** that reuse the Reports module's
 * use-cases, so DASH is single-sourced with RPT (BR-DASH-2/3, FR-RPT-003). The remaining sources that
 * RPT's aggregate read model cannot express — order action-counts, row-level recency (recent
 * orders/customers), and the entire leads cluster — stay on stub adapters carrying a
 * `TODO-INTEGRATION (<MODULE>)` marker pending ORD/CUST/LEAD read sides. DASH owns exactly one table —
 * `dashboard_preferences` (optional per-admin layout — FR-DASH-031).
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    ReportsModule,
    // ORD read side for the live "Needs attention" order counts + recent orders (FR-DASH-010/020).
    forwardRef(() => OrdersModule),
    TypeOrmModule.forFeature([DashboardPreferenceOrmEntity]),
  ],
  controllers: [DashboardController],
  providers: [
    { provide: REPORTS_METRICS_PORT, useClass: ReportsMetricsRptAdapter },
    { provide: ORDERS_DASHBOARD_PORT, useClass: OrdersDashboardRptAdapter },
    { provide: PAYMENTS_DASHBOARD_PORT, useClass: PaymentsDashboardRptAdapter },
    { provide: INVENTORY_DASHBOARD_PORT, useClass: InventoryDashboardRptAdapter },
    { provide: CUSTOMERS_DASHBOARD_PORT, useClass: CustomersDashboardRptAdapter },
    { provide: LEADS_DASHBOARD_PORT, useClass: LeadsDashboardStubAdapter },
    DashboardCacheService,
    DashboardService,
    DashboardPreferencesService,
  ],
})
export class DashboardModule {}
