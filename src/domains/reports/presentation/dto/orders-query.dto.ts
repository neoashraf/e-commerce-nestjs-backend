import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Query params for the orders report (FR-RPT-012; contract: GET /admin/reports/orders). */
export class OrdersQueryDto {
  @ApiProperty({ example: '2026-05-01', description: 'Inclusive start day (YYYY-MM-DD, Asia/Dhaka).' })
  @Matches(ISO_DATE, { message: 'from must be a calendar day (YYYY-MM-DD).' })
  from: string;

  @ApiProperty({ example: '2026-05-31', description: 'Inclusive end day (YYYY-MM-DD, Asia/Dhaka).' })
  @Matches(ISO_DATE, { message: 'to must be a calendar day (YYYY-MM-DD).' })
  to: string;
}
