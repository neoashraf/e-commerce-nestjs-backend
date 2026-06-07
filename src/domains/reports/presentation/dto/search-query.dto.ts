import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { MAX_TOP_N, MIN_TOP_N, SearchView } from '../../domain/report-views';
import { PeriodQueryDto } from './period-query.dto';

/** Query params for search insights (FR-RPT-060; contract: GET /admin/reports/search). */
export class SearchInsightsQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ enum: SearchView, default: SearchView.POPULAR, description: 'Report view.' })
  @IsOptional()
  @IsEnum(SearchView)
  view?: SearchView;

  @ApiPropertyOptional({ minimum: MIN_TOP_N, maximum: MAX_TOP_N, default: 20, description: 'Top-N queries.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_TOP_N)
  @Max(MAX_TOP_N)
  top_n?: number;
}
