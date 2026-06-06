import * as fs from 'fs/promises';
import * as path from 'path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface StoredExport {
  fileUrl: string;
  expiresAt: Date;
}

/**
 * Persists a rendered customer CSV export to local disk and returns an expiring public URL (FR-CUST-040,
 * §12.7 — "notified when the file is ready"). Dir + base URL + TTL are config-driven (`CUSTOMERS_EXPORT_*`).
 * Serving the file (static host / object store) is an infra concern outside this slice; the contract only
 * requires returning a `download_url` + `expires_at`. No secrets are written (non-sensitive fields only).
 */
@Injectable()
export class CustomerExportFileStore {
  private readonly dir: string;
  private readonly baseUrl: string;
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.dir =
      config.get<string>('CUSTOMERS_EXPORT_DIR') ?? path.join(process.cwd(), 'storage', 'exports');
    this.baseUrl = (
      config.get<string>('CUSTOMERS_EXPORT_PUBLIC_BASE_URL') ?? 'http://localhost:8000/exports'
    ).replace(/\/$/, '');
    this.ttlMs = Number(config.get('CUSTOMERS_EXPORT_TTL_MS') ?? 24 * 60 * 60 * 1000);
  }

  async save(exportId: string, csv: string, now: Date): Promise<StoredExport> {
    await fs.mkdir(this.dir, { recursive: true });
    const fileName = `customers-export-${exportId}.csv`;
    await fs.writeFile(path.join(this.dir, fileName), csv, 'utf8');
    return {
      fileUrl: `${this.baseUrl}/${fileName}`,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    };
  }
}
