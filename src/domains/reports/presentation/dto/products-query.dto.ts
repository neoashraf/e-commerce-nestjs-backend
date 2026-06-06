import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { MAX_TOP_N, MIN_TOP_N, ProductMetric, ProductView } from '../../domain/report-views';
import { PeriodQueryDto } from './period-query.dto';

/** Query params for the product report (FR-RPT-020/021; contract: GET /admin/reports/products). */
export class ProductsQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: ProductView, default: ProductView.TOP_SELLERS, description: 'Report view.' })
  @IsOptional()
  @IsEnum(ProductView)
  view?: ProductView;

  @ApiPropertyOptional({ enum: ProductMetric, default: ProductMetric.UNITS, description: 'Ranking metric.' })
  @IsOptional()
  @IsEnum(ProductMetric)
  metric?: ProductMetric;

  @ApiPropertyOptional({ minimum: MIN_TOP_N, maximum: MAX_TOP_N, default: 10, description: 'Top-N rows.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TOP_N)
  @Max(MAX_TOP_N)
  top_n?: number;
}
