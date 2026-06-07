import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Query for the recent-activity stream (FR-DASH-020/021). */
export class ActivityQueryDto {
  @ApiProperty({ enum: ['orders', 'customers', 'leads'], description: 'Which recent stream to fetch.' })
  @IsIn(['orders', 'customers', 'leads'])
  type: 'orders' | 'customers' | 'leads';

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
