import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { StockMovementType } from '../../domain/stock-movement-type';

/** Filters + pagination for the SKU movement-history read (FR-INV-051). */
export class ListMovementsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ enum: StockMovementType, description: 'Filter by movement type' })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({
    description: 'Inclusive lower bound on created_at (ISO date or date-time)',
    example: '2026-06-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound on created_at (ISO date or date-time)',
    example: '2026-06-04',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
