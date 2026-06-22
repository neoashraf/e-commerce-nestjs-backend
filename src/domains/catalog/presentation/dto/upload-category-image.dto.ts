import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { CategoryImageSlot } from '../../domain/enums/category-image-slot.enum';

/**
 * Multipart fields accompanying a category image upload. The `file` itself is handled by
 * `FileInterceptor`; `slot` selects which column the stored URL is written to.
 */
export class UploadCategoryImageDto {
  @ApiProperty({
    enum: CategoryImageSlot,
    description: 'Which image slot to set: thumbnail (image_url), logo (logo_url) or banner (banner_url).',
  })
  @IsEnum(CategoryImageSlot)
  slot: CategoryImageSlot;
}
