import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/** Release an order's held reservations (FR-INV-022/023). */
export class ReleaseDto {
  @ApiProperty({ description: 'Order whose held reservations to release' })
  @IsString()
  order_id: string;
}
