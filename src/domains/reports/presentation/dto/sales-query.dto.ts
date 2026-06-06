import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';

import { ReportBucket, SalesBreakdown } from '../../domain/report-period';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Query params for the sales report (FR-RPT-010/011; contract: GET /admin/reports/sales). */
export class SalesQueryDto {
  @ApiProperty({ example: '2026-05-01', description: 'Inclusive start day (YYYY-MM-DD, Asia/Dhaka).' })
  @Matches(ISO_DATE, { message: 'from must be a calendar day (YYYY-MM-DD).' })
  from: string;

  @ApiProperty({ example: '2026-05-31', description: 'Inclusive end day (YYYY-MM-DD, Asia/Dhaka).' })
  @Matches(ISO_DATE, { message: 'to must be a calendar day (YYYY-MM-DD).' })
  to: string;

  @ApiPropertyOptional({ enum: ReportBucket, default: ReportBucket.DAY, description: 'Time bucket.' })
  @IsOptional()
  @IsEnum(ReportBucket)
  bucket?: ReportBucket;

  @ApiPropertyOptional({
    enum: SalesBreakdown,
    default: SalesBreakdown.NONE,
    description: 'Optional breakdown dimension.',
  })
  @IsOptional()
  @IsEnum(SalesBreakdown)
  breakdown?: SalesBreakdown;
}
