import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Convert an order's reservation into a sale decrement on confirmation (FR-INV-030/033). */
export class DecrementDto {
  @ApiProperty({ description: 'Confirmed order to decrement (reservation → sale)' })
  @IsString()
  order_id: string;
}
