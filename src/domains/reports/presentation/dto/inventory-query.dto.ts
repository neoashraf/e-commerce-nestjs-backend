import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';

import { InventoryView } from '../../domain/report-views';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Query params for the inventory report (FR-RPT-030/031; contract: GET /admin/reports/inventory).
 * `from`/`to` are optional and only required for the `movement` view (validated in the controller); the
 * `levels`/`low_stock`/`out_of_stock` views are a current-snapshot read.
 */
export class InventoryQueryDto {
  @ApiPropertyOptional({ enum: InventoryView, default: InventoryView.LEVELS, description: 'Report view.' })
  @IsOptional()
  @IsEnum(InventoryView)
  view?: InventoryView;

  @ApiPropertyOptional({ example: '2026-05-01', description: 'Movement view: inclusive start day.' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'from must be a calendar day (YYYY-MM-DD).' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-31', description: 'Movement view: inclusive end day.' })
  @IsOptional()
  @Matches(ISO_DATE, { message: 'to must be a calendar day (YYYY-MM-DD).' })
  to?: string;
}
