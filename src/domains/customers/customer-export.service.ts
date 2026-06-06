import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditService } from '../rbac/application/services/audit.service';
import { AuditResult } from '../rbac/domain/enums/audit-result.enum';
import { CustomerDirectoryReader, DirectoryFilter, DirectoryRow } from './customers-directory.reader';
import { CustomerExportStatus } from './customers.enums';
import { CustomerExportFileStore } from './customer-export-file.store';
import { CustomerExportEntity } from './entities/customer-export.entity';
import { EXPORTABLE_FIELDS } from './dto/export.dto';
import { ExportJobDto, ExportStatusDto } from './dto/customer-responses';

export interface CreateExportCommand {
  adminId: string;
  filters: Record<string, unknown>;
  fields?: string[];
}

const EXPORT_PAGE_SIZE = 1000;
const EXPORT_MAX_ROWS = 50_000;

/**
 * Async customer-list export (FR-CUST-040, §12.7). The request inserts a `processing` row and returns
 * `202` immediately; the CSV is rendered out of band (`setImmediate`) over the same filtered set the
 * directory produces, then the row flips to `ready` with an expiring `download_url`. Excludes secrets
 * (non-sensitive fields only — §11) and is audit-logged (BR-CUST-6 / NFR auditability). Read-only over
 * source data (BR-CUST-1).
 */
@Injectable()
export class CustomerExportService {
  private readonly logger = new Logger(CustomerExportService.name);

  constructor(
    @InjectRepository(CustomerExportEntity)
    private readonly exports: Repository<CustomerExportEntity>,
    private readonly directory: CustomerDirectoryReader,
    private readonly fileStore: CustomerExportFileStore,
    private readonly audit: AuditService,
  ) {}

  async createExport(command: CreateExportCommand): Promise<ExportJobDto> {
    const fields = this.resolveFields(command.fields);
    const row = await this.exports.save(
      this.exports.create({
        requestedByAdminId: command.adminId,
        filters: command.filters ?? {},
        fields,
        status: CustomerExportStatus.PROCESSING,
      }),
    );

    void this.audit.record({
      actorAdminId: command.adminId,
      action: 'customers.customer.export',
      result: AuditResult.SUCCESS,
      entityType: 'customer_export',
      entityId: row.id,
      summary: { filters: command.filters ?? {}, fields },
    });

    setImmediate(() => {
      void this.processExport(row.id);
    });

    return { export_id: row.id, status: row.status };
  }

  async getExport(id: string): Promise<ExportStatusDto> {
    const row = await this.exports.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'EXPORT_NOT_FOUND', message: 'Export not found.' });
    }
    return {
      status: row.status,
      download_url: row.fileUrl,
      expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    };
  }

  /** Render the filtered set to CSV → store → mark ready. Failures are isolated and recorded. */
  async processExport(id: string, now: Date = new Date()): Promise<void> {
    const row = await this.exports.findOne({ where: { id } });
    if (!row || row.status !== CustomerExportStatus.PROCESSING) return;
    try {
      const rows = await this.collectRows(row.filters);
      const csv = this.toCsv(rows, row.fields);
      const stored = await this.fileStore.save(row.id, csv, now);
      row.status = CustomerExportStatus.READY;
      row.fileUrl = stored.fileUrl;
      row.expiresAt = stored.expiresAt;
      row.rowCount = rows.length;
      await this.exports.save(row);
    } catch (err) {
      row.status = CustomerExportStatus.FAILED;
      row.errorReason = (err as Error).message;
      await this.exports.save(row);
      this.logger.error(`Customer export ${id} failed: ${(err as Error).message}`);
    }
  }

  /** Page through the directory using the stored filters until exhausted (capped for safety). */
  private async collectRows(filters: Record<string, unknown>): Promise<DirectoryRow[]> {
    const out: DirectoryRow[] = [];
    let page = 1;
    for (;;) {
      const filter: DirectoryFilter = {
        q: (filters.q as string) || undefined,
        status: (filters.status as string) || undefined,
        tag: (filters.tag as string) || undefined,
        lastOrderFrom: (filters.last_order_from as string) || undefined,
        lastOrderTo: (filters.last_order_to as string) || undefined,
        includeGuests: false,
        page,
        limit: EXPORT_PAGE_SIZE,
      };
      const { rows } = await this.directory.query(filter);
      out.push(...rows);
      if (rows.length < EXPORT_PAGE_SIZE || out.length >= EXPORT_MAX_ROWS) break;
      page += 1;
    }
    return out.slice(0, EXPORT_MAX_ROWS);
  }

  private resolveFields(fields?: string[]): string[] {
    if (!fields || fields.length === 0) return [...EXPORTABLE_FIELDS];
    return fields.filter((f) => (EXPORTABLE_FIELDS as readonly string[]).includes(f));
  }

  /** Serialize rows to CSV with a header line; only the requested non-sensitive fields (§11). */
  private toCsv(rows: DirectoryRow[], fields: string[]): string {
    const header = fields.join(',');
    const lines = rows.map((r) => fields.map((f) => this.cell(r, f)).join(','));
    return [header, ...lines].join('\r\n');
  }

  private cell(row: DirectoryRow, field: string): string {
    const map: Record<string, string | number | null> = {
      full_name: row.fullName,
      phone: row.phone,
      email: row.email,
      status: row.status,
      order_count: row.orderCount,
      total_spent: row.totalSpent,
      last_order_at: row.lastOrderAt,
    };
    return this.escape(map[field]);
  }

  private escape(value: string | number | null): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
}
