import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { CustomerView, MAX_TOP_N, MIN_TOP_N } from '../../domain/report-views';
import { PeriodQueryDto } from './period-query.dto';

/** Query params for the customer report (FR-RPT-040/041; contract: GET /admin/reports/customers). */
export class CustomersQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({
    enum: CustomerView,
    default: CustomerView.NEW_VS_RETURNING,
    description: 'Report view.',
  })
  @IsOptional()
  @IsEnum(CustomerView)
  view?: CustomerView;

  @ApiPropertyOptional({ minimum: MIN_TOP_N, maximum: MAX_TOP_N, default: 10, description: 'Top-N customers.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TOP_N)
  @Max(MAX_TOP_N)
  top_n?: number;
}
