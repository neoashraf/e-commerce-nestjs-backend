import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsIn, IsUUID } from 'class-validator';

import { ProductStatus } from '../../domain/enums/product-type.enum';

/**
 * Body for `PATCH /admin/products/bulk-status` (SRS §10; FR-CAT-015/016) — apply a single status
 * transition to many products. `status` is restricted to `published` | `archived` (the list's bulk
 * bar); each id runs the same per-product validation as the single transition.
 */
export class BulkStatusDto {
  @ApiProperty({ type: [String], example: ['c7-uuid', 'c8-uuid'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];

  @ApiProperty({ enum: [ProductStatus.PUBLISHED, ProductStatus.ARCHIVED], example: 'published' })
  @IsIn([ProductStatus.PUBLISHED, ProductStatus.ARCHIVED])
  status: ProductStatus.PUBLISHED | ProductStatus.ARCHIVED;
}
