import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Add a product to the wishlist, optionally with a preferred variant (FR-WISH-001). */
export class AddItemDto {
  @ApiProperty({ example: 'c7a1e2f0-0000-4000-8000-000000000001', description: 'CAT product id' })
  @IsUUID()
  product_id: string;

  @ApiPropertyOptional({
    example: 'v1a1e2f0-0000-4000-8000-000000000002',
    description: 'Preferred variant (size/color); must belong to the product and be enabled',
  })
  @IsOptional()
  @IsUUID()
  preferred_variant_id?: string;
}
