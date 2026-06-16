import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import { ProductVideoSource } from '../../domain/enums/product-type.enum';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';

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
