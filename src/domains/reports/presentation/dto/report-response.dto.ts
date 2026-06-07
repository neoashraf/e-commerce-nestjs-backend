import { ApiProperty } from '@nestjs/swagger';

/** Swagger shape for a canonical metric definition (GET /admin/reports/metrics). */
export class MetricDefinitionDto {
  @ApiProperty({ example: 'net_revenue' })
  key: string;

  @ApiProperty({ example: 'Net Revenue' })
  label: string;

  @ApiProperty({ example: 'Σ(paid/collected grand_total) − Σ(refunds)' })
  formula: string;

  @ApiProperty({ example: 'Excludes cancelled/unpaid; refunds reduce the period they occur in.' })
  inclusion_rules: string;
}

/** Sales report totals (Swagger). */
export class SalesTotalsDto {
  @ApiProperty({ example: '2841000.00' })
  net_revenue: string;

  @ApiProperty({ example: '3120000.00' })
  gross_placed_value: string;

  @ApiProperty({ example: 432 })
  orders: number;

  @ApiProperty({ example: 511 })
  units: number;

  @ApiProperty({ example: '6576.39' })
  aov: string;
}

/** One sales time-series bucket (Swagger). */
export class SalesSeriesPointDto {
  @ApiProperty({ example: '2026-05-01' })
  bucket: string;

  @ApiProperty({ example: '92000.00' })
  net_revenue: string;

  @ApiProperty({ example: 14 })
  orders: number;

  @ApiProperty({ example: 17 })
  units: number;

  @ApiProperty({ example: '6571.43' })
  aov: string;
}

/** Full sales report (Swagger). `breakdown` is keyed by the requested dimension. */
export class SalesReportDto {
  @ApiProperty({ type: SalesTotalsDto })
  totals: SalesTotalsDto;

  @ApiProperty({ type: [SalesSeriesPointDto] })
  series: SalesSeriesPointDto[];

  @ApiProperty({
    example: { payment_method: { cod: '1700000.00', bkash: '780000.00', sslcommerz: '361000.00' } },
    description: 'Dimension → { key: amount }; empty when breakdown=none.',
  })
  breakdown: Record<string, Record<string, string>>;

  @ApiProperty({ example: '2026-06-04T08:55:00Z' })
  as_of: string;
}

/** Per-status entry of the orders report (Swagger). */
export class OrdersStatusEntryDto {
  @ApiProperty({ example: 380 })
  count: number;

  @ApiProperty({ example: '2500000.00' })
  value: string;
}

/** Full orders report (Swagger). */
export class OrdersReportDto {
  @ApiProperty({
    example: { delivered: { count: 380, value: '2500000.00' }, cancelled: { count: 31, value: '210000.00' } },
    description: 'Status → { count, value }.',
  })
  by_status: Record<string, OrdersStatusEntryDto>;

  @ApiProperty({ example: 0.072 })
  cancellation_rate: number;

  @ApiProperty({ example: 0.018 })
  return_rate: number;

  @ApiProperty({ example: '2026-06-04T08:55:00Z' })
  as_of: string;
}
