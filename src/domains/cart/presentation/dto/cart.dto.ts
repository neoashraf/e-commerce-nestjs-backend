import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID, Max, Min } from 'class-validator';

import { MAX_QTY_PER_LINE } from '../../application/cart/cart.constants';

/** POST /cart/items body (FR-CART-001). */
export class AddItemDto {
  @ApiProperty({
    example: '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b',
    description: 'Product variant (SKU) UUID.',
  })
  @IsUUID()
  @IsNotEmpty()
  variant_id: string;

  @ApiProperty({ example: 1, minimum: 1, maximum: MAX_QTY_PER_LINE })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QTY_PER_LINE)
  quantity: number;
}

/** PATCH /cart/items/{itemId} body (FR-CART-002). `quantity: 0` removes the line. */
export class UpdateItemDto {
  @ApiProperty({ example: 3, minimum: 0, maximum: MAX_QTY_PER_LINE })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_QTY_PER_LINE)
  quantity: number;
}

/** POST /cart/merge body (FR-CART-007). */
export class MergeCartDto {
  @ApiProperty({ example: 'guesttok_…', description: 'The guest cart token to merge in.' })
  @IsString()
  @IsNotEmpty()
  cart_token: string;
}

export class AddItemResultDto {
  @ApiProperty({ example: 'ci_1' })
  item_id: string;

  @ApiProperty({ example: 1 })
  quantity: number;

  @ApiProperty({ example: false })
  capped: boolean;
}
