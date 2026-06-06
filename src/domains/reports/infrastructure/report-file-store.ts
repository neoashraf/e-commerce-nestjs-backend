import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SerializedReport } from '../application/services/report-serializer.service';

export interface StoredFile {
  fileUrl: string;
  expiresAt: Date;
}

/**
 * Persists a rendered export to local disk and returns an expiring public URL (FR-RPT-070, §12.5 — "link
 * expires"). The storage dir + public base URL + TTL are config-driven (`REPORTS_EXPORT_*`); the dir is
 * created on demand. Serving the file (static host / object store) is an infra concern outside this slice;
 * the contract only requires returning a `file_url` + `expires_at`. No secrets are written — content comes
 * from the report serializer (report columns only).
 */
@Injectable()
export class ReportFileStore {
  private readonly dir: string;
  private readonly baseUrl: string;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.dir = config.get<string>('REPORTS_EXPORT_DIR') ?? path.join(process.cwd(), 'storage', 'exports');
    this.baseUrl = (config.get<string>('REPORTS_EXPORT_PUBLIC_BASE_URL') ?? 'http://localhost:8000/exports').replace(/\/$/, '');
    this.ttlMs = Number(config.get('REPORTS_EXPORT_TTL_MS') ?? 24 * 60 * 60 * 1000);
  }

  /** Write the serialized report under a unique filename and return its URL + expiry. */
  async save(exportId: string, reportKey: string, file: SerializedReport, now: Date): Promise<StoredFile> {
    await fs.mkdir(this.dir, { recursive: true });
    const fileName = `${reportKey}-${exportId}.${file.extension}`;
    await fs.writeFile(path.join(this.dir, fileName), file.buffer);
    return {
      fileUrl: `${this.baseUrl}/${fileName}`,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }
}
