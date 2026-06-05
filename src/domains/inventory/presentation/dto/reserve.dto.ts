import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** One line to reserve. */
export class ReserveLineDto {
  @ApiProperty({ description: 'Variant (SKU) id' })
  @IsUUID()
  variant_id: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity: number;
}

/** Reserve stock for an order at placement (FR-INV-020/023). */
export class ReserveDto {
  @ApiProperty({ description: 'Order the reservation is for' })
  @IsString()
  order_id: string;

  @ApiProperty({ type: [ReserveLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReserveLineDto)
  lines: ReserveLineDto[];
}
