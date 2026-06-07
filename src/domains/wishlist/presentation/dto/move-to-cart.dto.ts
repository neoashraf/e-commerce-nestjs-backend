import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Move a wishlist item to the cart (FR-WISH-020–023). */
export class MoveToCartDto {
  @ApiPropertyOptional({
    example: 'v1a1e2f0-0000-4000-8000-000000000002',
    description: 'Required only when the item has no resolvable preferred variant (FR-WISH-021)',
  })
  @IsOptional()
  @IsUUID()
  variant_id?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 10, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  quantity?: number;

  @ApiPropertyOptional({ example: true, default: true, description: 'Keep the item after moving (BR-WISH-7)' })
  @IsOptional()
  @IsBoolean()
  keep_in_wishlist?: boolean;
}
