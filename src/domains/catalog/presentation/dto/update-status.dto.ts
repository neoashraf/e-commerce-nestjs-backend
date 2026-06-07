import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { ProductStatus } from '../../domain/enums/product-type.enum';

/**
 * Lifecycle transition (FR-CAT-015/016). `published` runs publish validation (≥1 primary image,
 * ≥1 enabled variant, all required family attributes) → `422 NOT_PUBLISHABLE` with `details[]`
 * otherwise. `archived` hides from storefront but retains for orders.
 */
export class UpdateStatusDto {
  @ApiProperty({ enum: ProductStatus, example: ProductStatus.PUBLISHED })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}
