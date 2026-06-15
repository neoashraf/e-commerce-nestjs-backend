import { mkdir, writeFile } from 'fs/promises';
import { resolve as resolvePath } from 'path';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

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
  private readonly logger = new Logger(ProductMediaService.name);
  /** Absolute on-disk root for stored originals (served statically at `/uploads`, see main.ts). */
  private readonly uploadDir: string;
  /** Public origin the stored URLs are prefixed with so `<img src>` resolves from any frontend. */
  private readonly publicBaseUrl: string;

  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductVideoOrmEntity)
    private readonly videos: Repository<ProductVideoOrmEntity>,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.uploadDir = resolvePath(config.get<string>('MEDIA_UPLOAD_DIR') ?? 'uploads');
    // Documented as MEDIA_PUBLIC_BASE_URL (.env.example); fall back to the shared PUBLIC_BASE_URL
    // and finally a local-dev default so a missing var never silently breaks <img src>.
    this.publicBaseUrl = (
      config.get<string>('MEDIA_PUBLIC_BASE_URL') ??
      config.get<string>('PUBLIC_BASE_URL') ??
      'http://localhost:8000'
    ).replace(/\/+$/, '');
  }

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
      url = await this.storeOriginal(input.productId, file);
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
   * Persist the uploaded original to the configured storage backend and return its public URL.
   * Writes the binary to `${MEDIA_UPLOAD_DIR}/products/{id}/{file}` (served at `/uploads`, main.ts)
   * and returns an absolute URL (`${PUBLIC_BASE_URL}/uploads/...`) so the gallery renders from any
   * frontend origin. Swap this body for an S3 put without touching callers.
   */
  private async storeOriginal(productId: string, file: UploadedImageFile): Promise<string> {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${Date.now()}-${safeName}`;
    const dir = resolvePath(this.uploadDir, 'products', productId);
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(resolvePath(dir, fileName), file.buffer);
    } catch (cause) {
      // A non-writable MEDIA_UPLOAD_DIR (wrong/foreign-owned path, read-only FS) would otherwise
      // surface as an opaque 500. Log the real errno/path for ops and return a clear, actionable code.
      this.logger.error(
        `Failed to write upload to ${dir} (MEDIA_UPLOAD_DIR=${this.uploadDir}). ` +
          `Ensure the directory exists and is writable by the API process.`,
        cause instanceof Error ? cause.stack : String(cause),
      );
      throw new InternalServerErrorException({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'Could not store the uploaded image. Storage is not writable.',
      });
    }
    return `${this.publicBaseUrl}/uploads/products/${productId}/${fileName}`;
  }

  /**
   * Enqueue async rendition generation (thumb/listing/detail). Until a worker is wired the seeded
   * original-URL fallback already serves all renditions, so the gallery renders immediately (§12.8).
   */
  private enqueueRenditionGeneration(_imageId: string): void {
    // No-op seam: a background job (BullMQ/queue) replaces the fallback renditions when ready.
  }
}
