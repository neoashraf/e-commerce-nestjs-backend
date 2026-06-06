import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger response shapes for the dashboard (documentation only — the runtime envelope is applied
 * by the global ResponseInterceptor). Field names are snake_case per the API contract.
 */

class PeriodViewDto {
  @ApiProperty({ example: 'last_7d' }) preset: string;
  @ApiProperty({ example: '2026-05-29' }) from: string;
  @ApiProperty({ example: '2026-06-04' }) to: string;
  @ApiProperty({ example: '2026-05-22' }) compare_from: string;
  @ApiProperty({ example: '2026-05-28' }) compare_to: string;
}

class MoneyKpiDto {
  @ApiProperty({ example: '842300.00' }) value: string;
  @ApiProperty({ example: 'BDT' }) currency: string;
  @ApiProperty({ example: 12.4, nullable: true }) delta_pct: number | null;
  @ApiProperty({ example: 'up', enum: ['up', 'down', 'flat'] }) direction: string;
}

class CountKpiDto {
  @ApiProperty({ example: 128 }) value: number;
  @ApiProperty({ example: 8.1, nullable: true }) delta_pct: number | null;
  @ApiProperty({ example: 'up', enum: ['up', 'down', 'flat'] }) direction: string;
}

class KpisDto {
  @ApiProperty({ type: MoneyKpiDto }) sales: MoneyKpiDto;
  @ApiProperty({ type: CountKpiDto }) orders: CountKpiDto;
  @ApiProperty({ type: MoneyKpiDto }) avg_order_value: MoneyKpiDto;
  @ApiProperty({ type: CountKpiDto }) new_customers: CountKpiDto;
}

class AlertsDto {
  @ApiProperty({ example: 6, required: false }) orders_pending_payment?: number;
  @ApiProperty({ example: 14, required: false }) orders_to_process?: number;
  @ApiProperty({ example: 5, required: false }) orders_to_ship?: number;
  @ApiProperty({ example: 9, required: false }) low_stock_skus?: number;
  @ApiProperty({ example: 3, required: false }) out_of_stock_skus?: number;
  @ApiProperty({ example: 7, required: false }) new_leads?: number;
}

class TrendPointDto {
  @ApiProperty({ example: '2026-05-29' }) date: string;
  @ApiProperty({ example: '98000.00' }) sales: string;
  @ApiProperty({ example: 15 }) orders: number;
}

class TopProductDto {
  @ApiProperty({ example: 'c7…' }) product_id: string;
  @ApiProperty({ example: 'Adidas Predator Elite' }) title: string;
  @ApiProperty({ example: 22 }) units: number;
  @ApiProperty({ example: '275000.00' }) sales: string;
}

class BreakdownsDto {
  @ApiProperty({ type: [TrendPointDto] }) trend: TrendPointDto[];
  @ApiProperty({ example: { confirmed: 20, processing: 14, delivered: 80 } }) orders_by_status: Record<string, number>;
  @ApiProperty({ example: { cod: 70, bkash: 38, sslcommerz: 20 } }) payment_split: Record<string, number>;
  @ApiProperty({ type: [TopProductDto] }) top_products: TopProductDto[];
}

class SummaryDataDto {
  @ApiProperty({ type: PeriodViewDto }) period: PeriodViewDto;
  @ApiProperty({ type: KpisDto, required: false }) kpis?: KpisDto;
  @ApiProperty({ type: AlertsDto, required: false }) alerts?: AlertsDto;
  @ApiProperty({ type: BreakdownsDto, required: false }) breakdowns?: BreakdownsDto;
  @ApiProperty({ example: '2026-06-04T08:55:00Z' }) as_of: string;
}

class SummaryMetaDto {
  @ApiProperty({ example: ['kpis', 'alerts', 'breakdowns', 'recent_orders', 'recent_leads'] })
  visible_widgets: string[];
}

export class DashboardSummaryResponseDto {
  @ApiProperty({ type: SummaryDataDto }) data: SummaryDataDto;
  @ApiProperty({ type: SummaryMetaDto }) meta: SummaryMetaDto;
}

class RecentOrderDto {
  @ApiProperty({ example: 'SO-100246' }) order_no: string;
  @ApiProperty({ example: 'Sabbir Ahmed' }) customer: string;
  @ApiProperty({ example: '12241.20' }) grand_total: string;
  @ApiProperty({ example: 'confirmed' }) status: string;
  @ApiProperty({ example: '2026-06-04T08:40:00Z' }) placed_at: string;
}

export class ActivityResponseDto {
  @ApiProperty({ type: [RecentOrderDto], description: 'Shape varies by `type` (orders/customers/leads).' })
  data: RecentOrderDto[];
}

class RefreshDataDto {
  @ApiProperty({ example: '2026-06-04T09:00:00Z' }) as_of: string;
}

export class RefreshResponseDto {
  @ApiProperty({ type: RefreshDataDto }) data: RefreshDataDto;
}

class PreferenceDataDto {
  @ApiProperty({ example: 'last_7d' }) default_period: string;
  @ApiProperty({ example: ['kpis', 'alerts', 'breakdowns'], nullable: true, type: [String] })
  widget_order: string[] | null;
  @ApiProperty({ example: ['recent_leads'], nullable: true, type: [String] })
  hidden_widgets: string[] | null;
}

export class PreferencesResponseDto {
  @ApiProperty({ type: PreferenceDataDto }) data: PreferenceDataDto;
}

class PreferenceUpdatedDto {
  @ApiProperty({ example: true }) updated: boolean;
}

export class PreferencesUpdatedResponseDto {
  @ApiProperty({ type: PreferenceUpdatedDto }) data: PreferenceUpdatedDto;
}
