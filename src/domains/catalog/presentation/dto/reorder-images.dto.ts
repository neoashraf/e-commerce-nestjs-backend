import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

/**
 * Body for `PATCH /admin/products/{id}/images/reorder` (FR-CAT-031). `ordered_ids` is the **complete,
 * exact** set of the product's image ids in the desired gallery order — a partial or foreign set is
 * rejected (`400`) by the service.
 */
export class ReorderImagesDto {
  @ApiProperty({
    type: [String],
    description: "The product's full image-id set, in the desired display order",
    example: ['i3-uuid', 'i1-uuid', 'i2-uuid'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ordered_ids: string[];
}
