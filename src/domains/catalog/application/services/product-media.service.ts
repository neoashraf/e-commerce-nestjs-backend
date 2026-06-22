import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { ProductVideoSource } from '../../domain/enums/product-type.enum';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductSupportService } from './product-support.service';

/** The subset of a multipart upload the media service needs (no `@types/multer` dependency). */
export interface UploadedImageFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB (FR-CAT-031)

export interface AddImageInput {
  productId: string;
  altText: string;
  colorOptionId?: string;
  isPrimary?: boolean;
  displayOrder?: number;
}

export interface AddVideoInput {
  productId: string;
  source: ProductVideoSource;
  url?: string;
  displayOrder?: number;
}

export interface UpdateImageInput {
  altText?: string;
  /** `undefined` = leave unchanged; `null` = clear the tag; a uuid = set/validate the colour option. */
  colorOptionId?: string | null;
}

/**
 * Product media (FR-CAT-030–034): image upload with MIME/size/alt validation, exactly-one-primary
 * enforcement (mirrored to `Product.primary_image_id`), renditions JSON with original-URL fallback +
 * an async-generation seam, and ordered videos (after images). File storage is abstracted to a
 * stored URL; binary persistence (S3/local) is wired by ops config — here we persist the URL + the
 * rendition map and enqueue generation.
 */
@Injectable()
export class ProductMediaService {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductVideoOrmEntity)
    private readonly videos: Repository<ProductVideoOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly cloudinary: CloudinaryService,
    private readonly support: ProductSupportService,
  ) {}

  async addImage(
    file: UploadedImageFile | undefined,
    input: AddImageInput,
  ): Promise<{ id: string; renditions: Record<string, string> }> {
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
    if (!input.altText || input.altText.trim() === '') {
      throw new BadRequestException({ code: 'ALT_TEXT_REQUIRED', message: 'alt_text is required.' });
    }

    const product = await this.products.findOne({ where: { id: input.productId } });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product ${input.productId} not found.`,
      });
    }

    // Store the original (storage backend abstracted to a URL) and seed renditions with the
    // original-URL fallback; async generation replaces these later (§12.8).
    const url = await this.storeOriginal(input.productId, file);
    const renditions: Record<string, string> = { thumb: url, listing: url, detail: url };

    // First image (or an explicit is_primary) becomes the primary; only one primary per product.
    const existingCount = await this.images.count({ where: { productId: input.productId } });
    const makePrimary = input.isPrimary === true || existingCount === 0;

    const imageId = await this.dataSource.transaction(async (manager) => {
      const imgRepo = manager.getRepository(ProductImageOrmEntity);
      if (makePrimary) {
        await imgRepo.update({ productId: input.productId }, { isPrimary: false });
      }
      const saved = await imgRepo.save(
        imgRepo.create({
          productId: input.productId,
          url,
          renditions,
          altText: input.altText,
          colorOptionId: input.colorOptionId ?? null,
          isPrimary: makePrimary,
          displayOrder: input.displayOrder ?? existingCount,
        }),
      );
      if (makePrimary) {
        await manager
          .getRepository(ProductOrmEntity)
          .update({ id: input.productId }, { primaryImageId: saved.id });
      }
      return saved.id;
    });

    this.enqueueRenditionGeneration(imageId);
    return { id: imageId, renditions };
  }

  /**
   * Promote an already-uploaded image to primary (FR-CAT-032). Enforces exactly-one-primary the same
   * way an upload does: unset every other image, set this one, and mirror the choice to
   * `Product.primary_image_id` — so the storefront PDP (primary-first, `is_primary` flagged) reflects
   * the change immediately. The image must belong to the product (else 404).
   */
  async setPrimaryImage(
    productId: string,
    imageId: string,
  ): Promise<{ id: string; is_primary: boolean }> {
    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) {
      throw new NotFoundException({
        code: 'IMAGE_NOT_FOUND',
        message: `Image ${imageId} not found for product ${productId}.`,
      });
    }
    await this.dataSource.transaction(async (manager) => {
      const imgRepo = manager.getRepository(ProductImageOrmEntity);
      await imgRepo.update({ productId }, { isPrimary: false });
      await imgRepo.update({ id: imageId }, { isPrimary: true });
      await manager
        .getRepository(ProductOrmEntity)
        .update({ id: productId }, { primaryImageId: imageId });
    });
    return { id: imageId, is_primary: true };
  }

  /**
   * Reorder a product's gallery (FR-CAT-031). `orderedIds` must be the **complete, exact** set of the
   * product's image ids — a partial set or any foreign id is rejected (`400`); persists `display_order`
   * in the given order. `404` when the product doesn't exist. The storefront PDP renders this order.
   */
  async reorderImages(productId: string, orderedIds: string[]): Promise<{ ordered: string[] }> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product ${productId} not found.`,
      });
    }

    const existing = await this.images.find({ where: { productId }, select: { id: true } });
    const existingIds = new Set(existing.map((i) => i.id));
    const orderedSet = new Set(orderedIds);

    const isExactSet =
      orderedIds.length === existingIds.size &&
      orderedSet.size === orderedIds.length &&
      orderedIds.every((id) => existingIds.has(id));
    if (!isExactSet) {
      throw new BadRequestException({
        code: 'INVALID_IMAGE_ORDER',
        message: 'ordered_ids must be the complete, exact set of this product’s image ids.',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const imgRepo = manager.getRepository(ProductImageOrmEntity);
      for (let i = 0; i < orderedIds.length; i += 1) {
        await imgRepo.update({ id: orderedIds[i], productId }, { displayOrder: i });
      }
    });
    return { ordered: orderedIds };
  }

  /**
   * Edit an existing image's alt text and/or colour-tag (FR-CAT-032). At least one field must be
   * present. `colorOptionId` (when not `undefined`) is validated against the product family's `color`
   * options — `null` clears the tag; an id that is not a valid colour option → `400`. The image must
   * belong to the product (else `404`).
   */
  async updateImage(
    productId: string,
    imageId: string,
    input: UpdateImageInput,
  ): Promise<{ id: string; alt_text: string; color_option_id: string | null }> {
    if (input.altText === undefined && input.colorOptionId === undefined) {
      throw new BadRequestException({
        code: 'NO_FIELDS',
        message: 'Provide alt_text and/or color_option_id.',
      });
    }

    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) {
      throw new NotFoundException({
        code: 'IMAGE_NOT_FOUND',
        message: `Image ${imageId} not found for product ${productId}.`,
      });
    }

    const patch: Partial<ProductImageOrmEntity> = {};

    if (input.altText !== undefined) {
      const trimmed = input.altText.trim();
      if (trimmed === '') {
        throw new BadRequestException({ code: 'ALT_TEXT_REQUIRED', message: 'alt_text cannot be empty.' });
      }
      patch.altText = trimmed;
    }

    if (input.colorOptionId !== undefined) {
      if (input.colorOptionId !== null) {
        await this.assertValidColorOption(productId, input.colorOptionId);
      }
      patch.colorOptionId = input.colorOptionId;
    }

    await this.images.update({ id: imageId }, patch);

    const altText = patch.altText ?? image.altText;
    const colorOptionId =
      input.colorOptionId !== undefined ? input.colorOptionId : image.colorOptionId;
    return { id: imageId, alt_text: altText, color_option_id: colorOptionId };
  }

  /** Validate `colorOptionId` is a `color` attribute option in the product's family (FR-CAT-032; else 400). */
  private async assertValidColorOption(productId: string, colorOptionId: string): Promise<void> {
    const product = await this.products.findOne({ where: { id: productId } });
    const familyId = product?.familyId;
    const colorAttr = familyId
      ? (await this.support.getFamilyAttributes(familyId)).get('color')
      : undefined;
    const isValid = colorAttr?.options.some((o) => o.id === colorOptionId) ?? false;
    if (!isValid) {
      throw new BadRequestException({
        code: 'INVALID_COLOR_OPTION',
        message: `color_option_id ${colorOptionId} is not a valid color option for this product.`,
      });
    }
  }

  /**
   * Delete a product image (FR-CAT-032/033). Hard-deletes the row — images carry no soft-delete. If
   * the removed image was the primary, primary is reassigned to the remaining image with the lowest
   * `display_order` (mirrored to `Product.primary_image_id`); when none remain the primary is cleared
   * (re-raising the no-primary-image publish blocker). The image must belong to the product (else 404).
   * Returns the deleted id and the product's resulting `primary_image_id` (null when no images remain).
   */
  async deleteImage(
    productId: string,
    imageId: string,
  ): Promise<{ id: string; primary_image_id: string | null }> {
    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) {
      throw new NotFoundException({
        code: 'IMAGE_NOT_FOUND',
        message: `Image ${imageId} not found for product ${productId}.`,
      });
    }
    const primaryImageId = await this.dataSource.transaction(async (manager) => {
      const imgRepo = manager.getRepository(ProductImageOrmEntity);
      const prodRepo = manager.getRepository(ProductOrmEntity);
      await imgRepo.delete({ id: imageId });

      if (!image.isPrimary) {
        const product = await prodRepo.findOne({ where: { id: productId } });
        return product?.primaryImageId ?? null;
      }
      // Deleted the primary — promote the next image (lowest display_order, then oldest) if any remain.
      const next = await imgRepo.findOne({
        where: { productId },
        order: { displayOrder: 'ASC', createdAt: 'ASC' },
      });
      const nextId = next?.id ?? null;
      if (next) {
        await imgRepo.update({ id: next.id }, { isPrimary: true });
      }
      await prodRepo.update({ id: productId }, { primaryImageId: nextId });
      return nextId;
    });
    return { id: imageId, primary_image_id: primaryImageId };
  }

  async addVideo(input: AddVideoInput, file?: UploadedImageFile): Promise<{ id: string }> {
    const product = await this.products.findOne({ where: { id: input.productId } });
    if (!product) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: `Product ${input.productId} not found.`,
      });
    }

    let url: string;
    if (input.source === ProductVideoSource.URL) {
      if (!input.url) {
        throw new BadRequestException({ code: 'URL_REQUIRED', message: 'url is required for source=url.' });
      }
      url = input.url;
    } else {
      if (!file) {
        throw new BadRequestException({
          code: 'FILE_REQUIRED',
          message: 'A video file is required for source=upload.',
        });
      }
      url = await this.storeOriginal(input.productId, file, 'video');
    }

    const existingCount = await this.videos.count({ where: { productId: input.productId } });
    const saved = await this.videos.save(
      this.videos.create({
        productId: input.productId,
        source: input.source,
        url,
        displayOrder: input.displayOrder ?? existingCount,
      }),
    );
    return { id: saved.id };
  }

  /** Delete a product video (FR-CAT-034). The video must belong to the product (else 404). */
  async deleteVideo(productId: string, videoId: string): Promise<{ id: string }> {
    const video = await this.videos.findOne({ where: { id: videoId, productId } });
    if (!video) {
      throw new NotFoundException({
        code: 'VIDEO_NOT_FOUND',
        message: `Video ${videoId} not found for product ${productId}.`,
      });
    }
    await this.videos.delete({ id: videoId });
    return { id: videoId };
  }

  /**
   * Persist the uploaded original to Cloudinary and return its HTTPS delivery URL. Files land under
   * `products/{id}/` in the Cloudinary media library, so `<img src>`/`<video src>` resolves from any
   * frontend origin. {@link CloudinaryService} maps any failure to a `MEDIA_STORAGE_UNAVAILABLE` 500.
   */
  private async storeOriginal(
    productId: string,
    file: UploadedImageFile,
    resourceType: 'image' | 'video' = 'image',
  ): Promise<string> {
    const { url } = await this.cloudinary.upload({
      buffer: file.buffer,
      folder: `products/${productId}`,
      resourceType,
    });
    return url;
  }

  /**
   * Enqueue async rendition generation (thumb/listing/detail). Until a worker is wired the seeded
   * original-URL fallback already serves all renditions, so the gallery renders immediately (§12.8).
   */
  private enqueueRenditionGeneration(_imageId: string): void {
    // No-op seam: a background job (BullMQ/queue) replaces the fallback renditions when ready.
  }
}
