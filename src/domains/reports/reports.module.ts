import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { ORDERS_READ_MODEL } from './application/ports/orders-read.port';
import { PAYMENTS_READ_MODEL } from './application/ports/payments-read.port';
import { INVENTORY_READ_MODEL } from './application/ports/inventory-read.port';
import { CUSTOMERS_READ_MODEL } from './application/ports/customers-read.port';
import { PROMOTIONS_READ_MODEL } from './application/ports/promotions-read.port';
import { SEARCH_READ_MODEL } from './application/ports/search-read.port';
import { ADMIN_DIRECTORY } from './application/ports/admin-directory.port';
import { REPORT_NOTIFIER, StubReportNotifier } from './application/ports/report-notifier.port';
import { OrdersReadAdapter } from './infrastructure/adapters/orders-read.adapter';
import { PaymentsReadAdapter } from './infrastructure/adapters/payments-read.adapter';
import { InventoryReadAdapter } from './infrastructure/adapters/inventory-read.adapter';
import { CustomersReadAdapter } from './infrastructure/adapters/customers-read.adapter';
import { PromotionsReadAdapter } from './infrastructure/adapters/promotions-read.adapter';
import { SearchReadAdapter } from './infrastructure/adapters/search-read.adapter';
import { AdminDirectoryAdapter } from './infrastructure/adapters/admin-directory.adapter';
import { ReportFileStore } from './infrastructure/report-file-store';
import { ReportExportOrmEntity } from './infrastructure/persistence/typeorm/entities/report-export.orm-entity';
import { ScheduledReportOrmEntity } from './infrastructure/persistence/typeorm/entities/scheduled-report.orm-entity';
import { ReportCacheService } from './application/services/report-cache.service';
import { ReportContentService } from './application/services/report-content.service';
import { ReportSerializerService } from './application/services/report-serializer.service';
import { ExportService } from './application/services/export.service';
import { SchedulesService } from './application/services/schedules.service';
import { ScheduleTask } from './application/schedule.task';
import { GetMetricsUseCase } from './application/use-cases/get-metrics.use-case';
import { GetSalesReportUseCase } from './application/use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from './application/use-cases/get-orders-report.use-case';
import { GetProductReportUseCase } from './application/use-cases/get-product-report.use-case';
import { GetInventoryReportUseCase } from './application/use-cases/get-inventory-report.use-case';
import { GetCustomersReportUseCase } from './application/use-cases/get-customers-report.use-case';
import { GetPaymentsReportUseCase } from './application/use-cases/get-payments-report.use-case';
import { GetPromotionsReportUseCase } from './application/use-cases/get-promotions-report.use-case';
import { GetSearchReportUseCase } from './application/use-cases/get-search-report.use-case';
import { ReportsController } from './presentation/controllers/reports.controller';
import { ExportController } from './presentation/controllers/export.controller';
import { SchedulesController } from './presentation/controllers/schedules.controller';

/**
 * Reporting (RPT — FR-RPT-001/003, 010–072). Read-only aggregation over ORD/PAY/INV/CUST/PROMO/SRCH via
 * read ports (raw-SQL adapters over the source tables — no coupling to those domains' ORM classes).
 * RbacModule is imported (forwardRef, per the cross-module convention) for the admin JWT + permission
 * guards. The metric registry is code-maintained; aggregates are served from an in-memory `as_of` cache.
 * This module additionally owns the only two RPT tables — `report_exports` + `scheduled_reports` — for the
 * async export pipeline (FR-RPT-070) and the scheduled-digest cadence runner (FR-RPT-071), which reuse the
 * report use-cases to render CSV/PDF and deliver via the NOTIF port (suspended recipients skipped).
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([ReportExportOrmEntity, ScheduledReportOrmEntity]),
  ],
  controllers: [ReportsController, ExportController, SchedulesController],
  providers: [
    { provide: ORDERS_READ_MODEL, useClass: OrdersReadAdapter },
    { provide: PAYMENTS_READ_MODEL, useClass: PaymentsReadAdapter },
    { provide: INVENTORY_READ_MODEL, useClass: InventoryReadAdapter },
    { provide: CUSTOMERS_READ_MODEL, useClass: CustomersReadAdapter },
    { provide: PROMOTIONS_READ_MODEL, useClass: PromotionsReadAdapter },
    { provide: SEARCH_READ_MODEL, useClass: SearchReadAdapter },
    { provide: ADMIN_DIRECTORY, useClass: AdminDirectoryAdapter },
    { provide: REPORT_NOTIFIER, useClass: StubReportNotifier },
    ReportCacheService,
    ReportContentService,
    ReportSerializerService,
    ReportFileStore,
    ExportService,
    SchedulesService,
    ScheduleTask,
    GetMetricsUseCase,
    GetSalesReportUseCase,
    GetOrdersReportUseCase,
    GetProductReportUseCase,
    GetInventoryReportUseCase,
    GetCustomersReportUseCase,
    GetPaymentsReportUseCase,
    GetPromotionsReportUseCase,
    GetSearchReportUseCase,
  ],
  exports: [GetMetricsUseCase],
})
export class ReportsModule {}
