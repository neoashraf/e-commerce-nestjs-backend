import { ApiProperty } from '@nestjs/swagger';

/** Product report row — `top_sellers` / `slow_movers` (Swagger) (FR-RPT-020). */
export class ProductSalesRowDto {
  @ApiProperty({ example: 'c7a1…' })
  product_id: string;

  @ApiProperty({ example: 'Adidas Predator Elite' })
  title: string;

  @ApiProperty({ example: 88 })
  units: number;

  @ApiProperty({ example: '1100000.00' })
  revenue: string;
}

/** Product report row — `by_category` view (Swagger) (FR-RPT-021). */
export class CategorySalesRowDto {
  @ApiProperty({ example: 'cat_12…' })
  category_id: string;

  @ApiProperty({ example: 'Football Boots' })
  title: string;

  @ApiProperty({ example: 220 })
  units: number;

  @ApiProperty({ example: '2750000.00' })
  revenue: string;
}

/** Per-SKU stock row — inventory `levels`/`low_stock`/`out_of_stock` (Swagger) (FR-RPT-030). */
export class StockLevelRowDto {
  @ApiProperty({ example: 'var_9…' })
  variant_id: string;

  @ApiProperty({ example: 'c7a1…' })
  product_id: string;

  @ApiProperty({ example: 'PRD-ELITE-42' })
  sku_code: string;

  @ApiProperty({ example: 'Adidas Predator Elite' })
  product_title: string;

  @ApiProperty({ example: 14 })
  on_hand: number;

  @ApiProperty({ example: 2 })
  reserved: number;

  @ApiProperty({ example: 12 })
  available: number;

  @ApiProperty({ example: 5 })
  low_stock_threshold: number;

  @ApiProperty({ example: 'in_stock', enum: ['in_stock', 'low_stock', 'out_of_stock'] })
  status: string;
}

/** Inventory movement summary (Swagger) (FR-RPT-031). */
export class MovementReportDto {
  @ApiProperty({ example: 1200 })
  received: number;

  @ApiProperty({ example: 511 })
  sold: number;

  @ApiProperty({ example: -23 })
  adjusted: number;

  @ApiProperty({ example: 9 })
  restocked: number;

  @ApiProperty({ example: '2026-06-04T08:55:00Z' })
  as_of: string;
}

/** One top-LTV customer (Swagger) (FR-RPT-041). */
export class TopCustomerDto {
  @ApiProperty({ example: 'c_77…' })
  customer_id: string;

  @ApiProperty({ example: 'Sabbir Ahmed' })
  name: string;

  @ApiProperty({ example: '84230.00' })
  ltv: string;

  @ApiProperty({ example: 7 })
  orders: number;
}

/** Full customer report (Swagger) (FR-RPT-040/041). */
export class CustomerReportDto {
  @ApiProperty({ example: 120 })
  new_customers: number;

  @ApiProperty({ example: 88 })
  returning_customers: number;

  @ApiProperty({ example: 0.42 })
  repeat_rate: number;

  @ApiProperty({ type: [TopCustomerDto], description: 'Populated for the top_ltv view; empty otherwise.' })
  top: TopCustomerDto[];

  @ApiProperty({ example: '2026-06-04T08:55:00Z' })
  as_of: string;
}

/** Full payment report (Swagger) (FR-RPT-050). */
export class PaymentReportDto {
  @ApiProperty({ example: { cod: 250, bkash: 120, sslcommerz: 62 }, description: 'Paid/collected orders by method.' })
  method_split: Record<string, number>;

  @ApiProperty({ example: '1141000.00' })
  paid_online: string;

  @ApiProperty({ example: '1700000.00' })
  cod_collected: string;

  @ApiProperty({ example: '61000.00' })
  refunds: string;

  @ApiProperty({ example: '2026-06-04T08:55:00Z' })
  as_of: string;
}

/** One per-coupon performance row (Swagger) (FR-RPT-051). */
export class CouponPerformanceDto {
  @ApiProperty({ example: 'EID500' })
  coupon_code: string;

  @ApiProperty({ example: 312 })
  redemptions: number;

  @ApiProperty({ example: '156000.00' })
  discount_given: string;

  @ApiProperty({ example: '2100000.00' })
  attributed_sales: string;
}

/** One search-insights row (Swagger) (FR-RPT-060). */
export class SearchQueryRowDto {
  @ApiProperty({ example: 'messi boots' })
  query: string;

  @ApiProperty({ example: 142 })
  occurrences: number;

  @ApiProperty({ example: 0 })
  result_count: number;
}
