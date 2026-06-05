import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** Receive stock (FR-INV-010): add `quantity` (>0) with a required `reason`. */
export class ReceiveStockDto {
  @ApiProperty({ example: 50, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 'supplier_delivery_GRN-1187' })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
