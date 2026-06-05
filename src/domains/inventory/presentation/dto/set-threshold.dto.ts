import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/** Set the per-SKU low-stock threshold (FR-INV-013): integer ≥ 0. */
export class SetThresholdDto {
  @ApiProperty({ example: 5, minimum: 0 })
  @IsInt()
  @Min(0)
  low_stock_threshold: number;
}
