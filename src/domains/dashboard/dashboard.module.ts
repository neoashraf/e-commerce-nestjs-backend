import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { REPORTS_METRICS_PORT } from './application/ports/reports-metrics.port';
import { ORDERS_DASHBOARD_PORT } from './application/ports/orders-dashboard.port';
import { PAYMENTS_DASHBOARD_PORT } from './application/ports/payments-dashboard.port';
import { INVENTORY_DASHBOARD_PORT } from './application/ports/inventory-dashboard.port';
import { CUSTOMERS_DASHBOARD_PORT } from './application/ports/customers-dashboard.port';
import { LEADS_DASHBOARD_PORT } from './application/ports/leads-dashboard.port';
import { ReportsMetricsStubAdapter } from './infrastructure/adapters/reports-metrics.stub-adapter';
import { OrdersDashboardStubAdapter } from './infrastructure/adapters/orders-dashboard.stub-adapter';
import { PaymentsDashboardStubAdapter } from './infrastructure/adapters/payments-dashboard.stub-adapter';
import { InventoryDashboardStubAdapter } from './infrastructure/adapters/inventory-dashboard.stub-adapter';
import { CustomersDashboardStubAdapter } from './infrastructure/adapters/customers-dashboard.stub-adapter';
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
 * The read ports are bound to **stub adapters** returning representative data; each adapter carries
 * a `TODO-INTEGRATION (<MODULE>)` marker for the real wiring to RPT/ORD/PAY/INV/CUST/LEAD. DASH owns
 * exactly one table — `dashboard_preferences` (optional per-admin layout — FR-DASH-031).
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([DashboardPreferenceOrmEntity]),
  ],
  controllers: [DashboardController],
  providers: [
    { provide: REPORTS_METRICS_PORT, useClass: ReportsMetricsStubAdapter },
    { provide: ORDERS_DASHBOARD_PORT, useClass: OrdersDashboardStubAdapter },
    { provide: PAYMENTS_DASHBOARD_PORT, useClass: PaymentsDashboardStubAdapter },
    { provide: INVENTORY_DASHBOARD_PORT, useClass: InventoryDashboardStubAdapter },
    { provide: CUSTOMERS_DASHBOARD_PORT, useClass: CustomersDashboardStubAdapter },
    { provide: LEADS_DASHBOARD_PORT, useClass: LeadsDashboardStubAdapter },
    DashboardCacheService,
    DashboardService,
    DashboardPreferencesService,
  ],
})
export class DashboardModule {}
