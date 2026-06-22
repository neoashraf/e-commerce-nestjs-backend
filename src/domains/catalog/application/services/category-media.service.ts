import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { CategoryImageSlot } from '../../domain/enums/category-image-slot.enum';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import type { UploadedImageFile } from './product-media.service';

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (SRS §11)

/** Maps a slot to the `categories` URL column it writes. */
const SLOT_COLUMN: Record<CategoryImageSlot, 'imageUrl' | 'logoUrl' | 'bannerUrl'> = {
  [CategoryImageSlot.THUMBNAIL]: 'imageUrl',
  [CategoryImageSlot.LOGO]: 'logoUrl',
  [CategoryImageSlot.BANNER]: 'bannerUrl',
};

/**
 * Category media (FR-CAT-001/010a): single-image upload for a category's thumbnail / logo / banner.
 * Validates MIME + size (mirrors the product-media rules), stores the original via {@link CloudinaryService}
 * (the same storage path products use), and persists the returned URL to the matching column. Categories
 * keep one URL per slot — there is no gallery — so this replaces (not appends to) the column value.
 */
@Injectable()
export class CategoryMediaService {
  constructor(
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async uploadImage(
    categoryId: string,
    slot: CategoryImageSlot,
    file: UploadedImageFile | undefined,
  ): Promise<{ url: string; slot: CategoryImageSlot }> {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'An image file is required.' });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE_TYPE',
        message: 'Image must be JPEG, PNG, or WebP.',
      });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be ≤ 5 MB.' });
    }

    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Category ${categoryId} not found.`,
      });
    }

    const { url } = await this.cloudinary.upload({
      buffer: file.buffer,
      folder: `categories/${categoryId}`,
      resourceType: 'image',
    });

    await this.categories.update({ id: categoryId }, { [SLOT_COLUMN[slot]]: url });

    return { url, slot };
  }
}
