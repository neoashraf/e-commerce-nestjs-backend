import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  InvalidReportPeriodError,
  ReportBucket,
  ReportPeriod,
  SalesBreakdown,
} from '../../domain/report-period';
import {
  CustomerView,
  DEFAULT_TOP_N,
  InventoryView,
  ProductMetric,
  ProductView,
  SearchView,
} from '../../domain/report-views';
import { GetMetricsUseCase } from '../../application/use-cases/get-metrics.use-case';
import { GetSalesReportUseCase } from '../../application/use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from '../../application/use-cases/get-orders-report.use-case';
import {
  GetProductReportUseCase,
  ProductReportRow,
} from '../../application/use-cases/get-product-report.use-case';
import {
  GetInventoryReportUseCase,
  MovementReport,
} from '../../application/use-cases/get-inventory-report.use-case';
import {
  CustomerReport,
  GetCustomersReportUseCase,
} from '../../application/use-cases/get-customers-report.use-case';
import {
  GetPaymentsReportUseCase,
  PaymentReport,
} from '../../application/use-cases/get-payments-report.use-case';
import { GetPromotionsReportUseCase } from '../../application/use-cases/get-promotions-report.use-case';
import { GetSearchReportUseCase } from '../../application/use-cases/get-search-report.use-case';
import { CouponPerformanceRow } from '../../application/ports/promotions-read.port';
import { StockLevelRow } from '../../application/ports/inventory-read.port';
import { SearchQueryRow } from '../../application/ports/search-read.port';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { OrdersQueryDto } from '../dto/orders-query.dto';
import { ProductsQueryDto } from '../dto/products-query.dto';
import { InventoryQueryDto } from '../dto/inventory-query.dto';
import { CustomersQueryDto } from '../dto/customers-query.dto';
import { PeriodQueryDto } from '../dto/period-query.dto';
import { SearchInsightsQueryDto } from '../dto/search-query.dto';
import {
  MetricDefinitionDto,
  OrdersReportDto,
  SalesReportDto,
} from '../dto/report-response.dto';
import {
  CouponPerformanceDto,
  CustomerReportDto,
  PaymentReportDto,
  ProductSalesRowDto,
  SearchQueryRowDto,
  StockLevelRowDto,
} from '../dto/report-family-response.dto';

/**
 * Reporting core (RPT) — canonical metric registry + sales & orders reports (FR-RPT-001/003, 010–012).
 * Read-only; every route requires an admin token with `reports.report.view` (the RBAC catalog code for
 * "View reports"; the contract names it `reports.read`). Each result carries an `as_of` freshness stamp.
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/reports')
export class ReportsController {
  constructor(
    private readonly getMetrics: GetMetricsUseCase,
    private readonly getSales: GetSalesReportUseCase,
    private readonly getOrders: GetOrdersReportUseCase,
    private readonly getProducts: GetProductReportUseCase,
    private readonly getInventory: GetInventoryReportUseCase,
    private readonly getCustomers: GetCustomersReportUseCase,
    private readonly getPayments: GetPaymentsReportUseCase,
    private readonly getPromotions: GetPromotionsReportUseCase,
    private readonly getSearch: GetSearchReportUseCase,
  ) {}

  @Get('metrics')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Canonical metric definitions (reused verbatim by the dashboard)' })
  @ApiOkResponse({ type: [MetricDefinitionDto] })
  metrics(): MetricDefinitionDto[] {
    return this.getMetrics.execute();
  }

  @Get('sales')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Sales report: totals + time series + optional breakdown' })
  @ApiOkResponse({ type: SalesReportDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async sales(@Query() query: SalesQueryDto): Promise<SalesReportDto> {
    const period = this.buildPeriod(query.from, query.to, query.bucket);
    return this.getSales.execute(period, query.breakdown ?? SalesBreakdown.NONE);
  }

  @Get('orders')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Orders report: by-status counts/value + cancellation/return rates' })
  @ApiOkResponse({ type: OrdersReportDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async orders(@Query() query: OrdersQueryDto): Promise<OrdersReportDto> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getOrders.execute(period);
  }

  @Get('products')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Product report: top sellers / by category / slow movers' })
  @ApiOkResponse({ type: [ProductSalesRowDto], description: 'by_category returns CategorySalesRow rows.' })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async products(@Query() query: ProductsQueryDto): Promise<ProductReportRow[]> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getProducts.execute(
      period,
      query.view ?? ProductView.TOP_SELLERS,
      query.metric ?? ProductMetric.UNITS,
      query.top_n ?? DEFAULT_TOP_N,
    );
  }

  @Get('inventory')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Inventory report: stock levels / low / out / period movement summary' })
  @ApiOkResponse({ type: [StockLevelRowDto], description: 'movement view returns a MovementReport object.' })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — movement view requires from/to' })
  async inventory(
    @Query() query: InventoryQueryDto,
  ): Promise<StockLevelRow[] | MovementReport> {
    const view = query.view ?? InventoryView.LEVELS;
    if (view === InventoryView.MOVEMENT) {
      if (!query.from || !query.to) {
        throw new BadRequestException({
          code: 'INVALID_PERIOD',
          message: 'The movement view requires `from` and `to`.',
        });
      }
      return this.getInventory.movement(this.buildPeriod(query.from, query.to));
    }
    return this.getInventory.levels(view);
  }

  @Get('customers')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Customer report: new vs returning + repeat rate + top LTV' })
  @ApiOkResponse({ type: CustomerReportDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async customers(@Query() query: CustomersQueryDto): Promise<CustomerReport> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getCustomers.execute(
      period,
      query.view ?? CustomerView.NEW_VS_RETURNING,
      query.top_n ?? DEFAULT_TOP_N,
    );
  }

  @Get('payments')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Payment report: method split, paid online, COD collected, refunds' })
  @ApiOkResponse({ type: PaymentReportDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async payments(@Query() query: PeriodQueryDto): Promise<PaymentReport> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getPayments.execute(period);
  }

  @Get('promotions')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Promotion report: per-coupon redemptions, discount, attributed sales' })
  @ApiOkResponse({ type: [CouponPerformanceDto] })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async promotions(@Query() query: PeriodQueryDto): Promise<CouponPerformanceRow[]> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getPromotions.execute(period);
  }

  @Get('search')
  @Requires('reports.report.view')
  @ApiOperation({ summary: 'Search insights: popular / zero-result queries' })
  @ApiOkResponse({ type: [SearchQueryRowDto] })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — bad or oversized range' })
  async search(@Query() query: SearchInsightsQueryDto): Promise<SearchQueryRow[]> {
    const period = this.buildPeriod(query.from, query.to);
    return this.getSearch.execute(
      period,
      query.view ?? SearchView.POPULAR,
      query.top_n ?? DEFAULT_TOP_N,
    );
  }

  /** Build a validated period, mapping the domain range error to `400 INVALID_PERIOD` (contract). */
  private buildPeriod(from: string, to: string, bucket?: ReportBucket): ReportPeriod {
    try {
      return ReportPeriod.create(from, to, bucket ?? ReportBucket.DAY);
    } catch (err) {
      if (err instanceof InvalidReportPeriodError) {
        throw new BadRequestException({ code: 'INVALID_PERIOD', message: err.reason });
      }
      throw err;
    }
  }
}
