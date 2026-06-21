import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

/**
 * Cloudinary resource kinds we upload. `auto` lets Cloudinary detect image vs. video;
 * `raw` stores arbitrary, non-media files verbatim (e.g. CSV/PDF report & customer exports).
 */
export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

export interface CloudinaryUploadInput {
  /** Raw bytes of the uploaded file (from the multipart buffer). */
  buffer: Buffer;
  /** Sub-folder under the configured root, e.g. `products/<id>` or `lead-attachments`. */
  folder: string;
  /** Defaults to `image`; use `video` / `auto` for non-image media. */
  resourceType?: CloudinaryResourceType;
  /** Optional fixed public id (without extension); Cloudinary generates one when omitted. */
  publicId?: string;
}

export interface CloudinaryUploadResult {
  /** HTTPS delivery URL — store this and use it directly as `<img src>` / `<video src>`. */
  url: string;
  /** Cloudinary public id (folder + name, no extension) — needed for later deletes/transforms. */
  publicId: string;
  /** Stored byte size as reported by Cloudinary. */
  bytes: number;
  /** Detected format (e.g. `jpg`, `png`, `mp4`). */
  format: string;
}

/**
 * Thin wrapper over the Cloudinary SDK so every domain stores media the same way: upload a buffer,
 * get back an HTTPS delivery URL. This replaces local-disk storage (`MEDIA_UPLOAD_DIR`/`writeFile`),
 * which broke in production when the upload path was not writable (`MEDIA_STORAGE_UNAVAILABLE`).
 *
 * Credentials come from `ConfigService` (`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` /
 * `CLOUDINARY_API_SECRET`). When unconfigured we throw the same `MEDIA_STORAGE_UNAVAILABLE` code so
 * callers/clients keep a single, actionable error contract.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  /** Root folder all uploads are nested under in the Cloudinary account (keeps the media library tidy). */
  private readonly rootFolder: string;
  /** Whether usable credentials were supplied at boot. */
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = config.get<string>('CLOUDINARY_API_SECRET');
    this.rootFolder = (config.get<string>('CLOUDINARY_ROOT_FOLDER') ?? 'ecommerce').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.configured = Boolean(cloudName && apiKey && apiSecret);

    if (this.configured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary is not configured — image/video uploads will fail. Set CLOUDINARY_CLOUD_NAME, ' +
          'CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env.',
      );
    }
  }

  /** Upload a buffer to Cloudinary and return its HTTPS delivery URL + metadata. */
  async upload(input: CloudinaryUploadInput): Promise<CloudinaryUploadResult> {
    if (!this.configured) {
      throw new InternalServerErrorException({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'Media storage is not configured. Cloudinary credentials are missing.',
      });
    }

    const folder = `${this.rootFolder}/${input.folder}`.replace(/\/+/g, '/').replace(/\/+$/, '');

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder,
            resource_type: input.resourceType ?? 'image',
            public_id: input.publicId,
            overwrite: true,
          },
          (error, response) => {
            if (error || !response) {
              reject(error ?? new Error('Empty response from Cloudinary'));
              return;
            }
            resolve(response);
          },
        );
        stream.end(input.buffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        bytes: result.bytes,
        format: result.format,
      };
    } catch (cause) {
      this.logger.error(
        `Cloudinary upload failed (folder=${folder}). Check credentials and network access.`,
        cause instanceof Error ? cause.stack : String(cause),
      );
      throw new InternalServerErrorException({
        code: 'MEDIA_STORAGE_UNAVAILABLE',
        message: 'Could not store the uploaded file. Media upload to Cloudinary failed.',
      });
    }
  }
}
