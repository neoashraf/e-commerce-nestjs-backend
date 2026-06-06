import { forwardRef, Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module';
import { ORDERS_READ_MODEL } from './application/ports/orders-read.port';
import { PAYMENTS_READ_MODEL } from './application/ports/payments-read.port';
import { OrdersReadAdapter } from './infrastructure/adapters/orders-read.adapter';
import { PaymentsReadAdapter } from './infrastructure/adapters/payments-read.adapter';
import { ReportCacheService } from './application/services/report-cache.service';
import { GetMetricsUseCase } from './application/use-cases/get-metrics.use-case';
import { GetSalesReportUseCase } from './application/use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from './application/use-cases/get-orders-report.use-case';
import { ReportsController } from './presentation/controllers/reports.controller';

/**
 * Reporting core (RPT — FR-RPT-001/003, 010–012). Read-only aggregation over ORD/PAY via read ports
 * (raw-SQL adapters over the source tables — no coupling to those domains' ORM classes). RbacModule is
 * imported (forwardRef, per the cross-module convention) for the admin JWT + permission guards. The
 * metric registry is code-maintained; aggregates are served from an in-memory `as_of` cache, so this
 * slice owns no tables (export/schedule persistence belongs to rpt-export-be).
 */
@Module({
  imports: [forwardRef(() => RbacModule)],
  controllers: [ReportsController],
  providers: [
    { provide: ORDERS_READ_MODEL, useClass: OrdersReadAdapter },
    { provide: PAYMENTS_READ_MODEL, useClass: PaymentsReadAdapter },
    ReportCacheService,
    GetMetricsUseCase,
    GetSalesReportUseCase,
    GetOrdersReportUseCase,
  ],
  exports: [GetMetricsUseCase],
})
export class ReportsModule {}
