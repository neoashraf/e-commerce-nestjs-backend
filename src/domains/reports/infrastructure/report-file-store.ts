import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CloudinaryService } from '../../../shared/media/cloudinary.service';
import { SerializedReport } from '../application/services/report-serializer.service';

export interface StoredFile {
  fileUrl: string;
  expiresAt: Date;
}

/**
 * Persists a rendered export to Cloudinary (as a `raw` file) and returns an expiring public URL
 * (FR-RPT-070, §12.5 — "link expires"). Cloudinary replaces local-disk storage (`REPORTS_EXPORT_DIR` /
 * `fs.writeFile`), which broke on the deployed server when the export path was not writable — the same
 * failure that previously forced product/lead media onto Cloudinary. The upload sub-folder is config-driven
 * (`REPORTS_EXPORT_FOLDER`); `expires_at` is still computed from `REPORTS_EXPORT_TTL_MS` to honour the
 * contract's link-expiry field. No secrets are written — content comes from the report serializer (report
 * columns only).
 */
@Injectable()
export class ReportFileStore {
  private readonly folder: string;
  private readonly ttlMs: number;

  constructor(
    config: ConfigService,
    private readonly cloudinary: CloudinaryService,
  ) {
    this.folder = (config.get<string>('REPORTS_EXPORT_FOLDER') ?? 'report-exports').replace(
      /^\/+|\/+$/g,
      '',
    );
    this.ttlMs = Number(config.get('REPORTS_EXPORT_TTL_MS') ?? 24 * 60 * 60 * 1000);
  }

  /** Upload the serialized report under a unique filename and return its URL + expiry. */
  async save(exportId: string, reportKey: string, file: SerializedReport, now: Date): Promise<StoredFile> {
    const { url } = await this.cloudinary.upload({
      buffer: file.buffer,
      folder: this.folder,
      resourceType: 'raw',
      // Keep the extension on the public id so the delivery URL ends in `.csv`/`.pdf`.
      publicId: `${reportKey}-${exportId}.${file.extension}`,
    });
    return {
      fileUrl: url,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }
}
