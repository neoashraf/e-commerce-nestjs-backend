import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

/**
 * Adjust stock by a signed delta (FR-INV-011/012). `quantity_delta != 0` and `reason` required
 * (enforced in the service for the != 0 rule); a result that would make on_hand negative →
 * `409 NEGATIVE_ON_HAND`.
 */
export class AdjustStockDto {
  @ApiProperty({ example: -2, description: 'Signed delta (must be non-zero)' })
  @IsInt()
  quantity_delta: number;

  @ApiProperty({ example: 'damaged_in_storage' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
