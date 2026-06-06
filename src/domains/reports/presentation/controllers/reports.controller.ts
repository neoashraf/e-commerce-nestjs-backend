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
import { GetMetricsUseCase } from '../../application/use-cases/get-metrics.use-case';
import { GetSalesReportUseCase } from '../../application/use-cases/get-sales-report.use-case';
import { GetOrdersReportUseCase } from '../../application/use-cases/get-orders-report.use-case';
import { SalesQueryDto } from '../dto/sales-query.dto';
import { OrdersQueryDto } from '../dto/orders-query.dto';
import {
  MetricDefinitionDto,
  OrdersReportDto,
  SalesReportDto,
} from '../dto/report-response.dto';

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
