import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';

import { DashboardPeriodPreset } from '../../domain/dashboard-period';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Query for the dashboard summary + refresh (FR-DASH-003). `from`/`to` apply only to `custom`. */
export class DashboardQueryDto {
  @ApiPropertyOptional({
    enum: DashboardPeriodPreset,
    default: DashboardPeriodPreset.LAST_7D,
    description: 'Period preset; `custom` additionally requires `from` and `to`.',
  })
  @IsOptional()
  @IsEnum(DashboardPeriodPreset)
  period?: DashboardPeriodPreset;

  @ApiPropertyOptional({ example: '2026-05-01', description: 'Custom-range start day (YYYY-MM-DD, Asia/Dhaka).' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be a calendar day (YYYY-MM-DD).' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31', description: 'Custom-range end day (YYYY-MM-DD, Asia/Dhaka).' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be a calendar day (YYYY-MM-DD).' })
  to?: string;
}
