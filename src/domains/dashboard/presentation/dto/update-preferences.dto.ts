import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

import { DashboardPeriodPreset } from '../../domain/dashboard-period';

/** Body for `PUT /admin/dashboard/preferences` (FR-DASH-031). Unknown widget keys → `400`. */
export class UpdatePreferencesDto {
  @ApiPropertyOptional({ enum: DashboardPeriodPreset, example: DashboardPeriodPreset.TODAY })
  @IsOptional()
  @IsEnum(DashboardPeriodPreset)
  default_period?: DashboardPeriodPreset;

  @ApiPropertyOptional({ type: [String], example: ['kpis', 'alerts', 'breakdowns'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  widget_order?: string[];

  @ApiPropertyOptional({ type: [String], example: ['recent_leads'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hidden_widgets?: string[];
}
