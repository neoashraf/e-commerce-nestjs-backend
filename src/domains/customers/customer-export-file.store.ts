import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CloudinaryService } from '../../shared/media/cloudinary.service';

export interface StoredExport {
  fileUrl: string;
  expiresAt: Date;
}

/**
 * Persists a rendered customer CSV export to Cloudinary (as a `raw` file) and returns an expiring public
 * URL (FR-CUST-040, §12.7 — "notified when the file is ready"). Cloudinary replaces local-disk storage
 * (`CUSTOMERS_EXPORT_DIR` / `fs.writeFile`), which broke on the deployed server when the export path was
 * not writable — the same failure that forced media (and now report exports) onto Cloudinary. The upload
 * sub-folder is config-driven (`CUSTOMERS_EXPORT_FOLDER`); `expires_at` is still computed from
 * `CUSTOMERS_EXPORT_TTL_MS` to honour the contract's link-expiry field. No secrets are written
 * (non-sensitive fields only).
 */
@Injectable()
export class CustomerExportFileStore {
  private readonly folder: string;
  private readonly ttlMs: number;

  constructor(
    config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.folder = (config.get<string>('CUSTOMERS_EXPORT_FOLDER') ?? 'customer-exports').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.ttlMs = Number(config.get('CUSTOMERS_EXPORT_TTL_MS') ?? 24 * 60 * 60 * 1000);
  }

  async save(exportId: string, csv: string, now: Date): Promise<StoredExport> {
    const { url } = await this.cloudinary.upload({
      buffer: Buffer.from(csv, 'utf8'),
      folder: this.folder,
      resourceType: 'raw',
      publicId: `customers-export-${exportId}.csv`,
    });
    return {
      fileUrl: url,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }
}
