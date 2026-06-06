import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { CustomerStatus } from '../customers.enums';

/** Parse `?key=1&limit=50`-style query strings into a bounded positive integer. */
const toInt = (fallback: number, min: number, max: number) =>
  Transform(({ value }) => {
    const n = Number.parseInt(String(value), 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(Math.max(n, min), max);
  });

/** Directory list/search query (FR-CUST-001–004; contract: GET /admin/customers). */
export class ListCustomersQueryDto {
  @ApiPropertyOptional({ description: 'Search name / phone (E.164) / email', example: '+8801712345678' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: CustomerStatus, description: 'Account status filter' })
  @IsOptional()
  @IsIn(Object.values(CustomerStatus))
  status?: CustomerStatus;

  @ApiPropertyOptional({ description: 'Filter by tag key', example: 'vip' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional({ description: 'Only customers with (true) / without (false) paid orders' })
  @IsOptional()
  @IsBooleanString()
  has_orders?: string;

  @ApiPropertyOptional({ description: 'Include order-derived guest contacts', example: false })
  @IsOptional()
  @IsBooleanString()
  include_guests?: string;

  @ApiPropertyOptional({ description: 'Registration date from (ISO)', example: '2025-01-01' })
  @IsOptional()
  @IsString()
  registration_from?: string;

  @ApiPropertyOptional({ description: 'Registration date to (ISO)', example: '2026-01-01' })
  @IsOptional()
  @IsString()
  registration_to?: string;

  @ApiPropertyOptional({ description: 'Last order from (ISO)', example: '2026-01-01' })
  @IsOptional()
  @IsString()
  last_order_from?: string;

  @ApiPropertyOptional({ description: 'Last order to (ISO)', example: '2026-06-01' })
  @IsOptional()
  @IsString()
  last_order_to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @toInt(1, 1, Number.MAX_SAFE_INTEGER)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @toInt(50, 1, 200)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
