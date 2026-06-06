import { forwardRef, Module } from '@nestjs/common';

import { RbacModule } from '../rbac/rbac.module';
import { ORDERS_READ_MODEL } from './application/ports/orders-read.port';
import { PAYMENTS_READ_MODEL } from './application/ports/payments-read.port';
import { INVENTORY_READ_MODEL } from './application/ports/inventory-read.port';
import { CUSTOMERS_READ_MODEL } from './application/ports/customers-read.port';
import { PROMOTIONS_READ_MODEL } from './application/ports/promotions-read.port';
import { SEARCH_READ_MODEL } from './application/ports/search-read.port';
import { OrdersReadAdapter } from './infrastructure/adapters/orders-read.adapter';
import { PaymentsReadAdapter } from './infrastructure/adapters/payments-read.adapter';
import { InventoryReadAdapter } from './infrastructure/adapters/inventory-read.adapter';
import { CustomersReadAdapter } from './infrastructure/adapters/customers-read.adapter';
import { PromotionsReadAdapter } from './infrastructure/adapters/promotions-read.adapter';
import { SearchReadAdapter } from './infrastructure/adapters/search-read.adapter';
import { ReportCacheService } from './application/services/report-cache.service';
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

/**
 * Reporting (RPT — FR-RPT-001/003, 010–060). Read-only aggregation over ORD/PAY/INV/CUST/PROMO/SRCH via
 * read ports (raw-SQL adapters over the source tables — no coupling to those domains' ORM classes).
 * RbacModule is imported (forwardRef, per the cross-module convention) for the admin JWT + permission
 * guards. The metric registry is code-maintained; aggregates are served from an in-memory `as_of` cache,
 * so this slice owns no tables (export/schedule persistence belongs to rpt-export-be).
 */
@Module({
  imports: [forwardRef(() => RbacModule)],
  controllers: [ReportsController],
  providers: [
    { provide: ORDERS_READ_MODEL, useClass: OrdersReadAdapter },
    { provide: PAYMENTS_READ_MODEL, useClass: PaymentsReadAdapter },
    { provide: INVENTORY_READ_MODEL, useClass: InventoryReadAdapter },
    { provide: CUSTOMERS_READ_MODEL, useClass: CustomersReadAdapter },
    { provide: PROMOTIONS_READ_MODEL, useClass: PromotionsReadAdapter },
    { provide: SEARCH_READ_MODEL, useClass: SearchReadAdapter },
    ReportCacheService,
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
