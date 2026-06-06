import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ExportFormat, ExportStatus, isReportKey, ReportKey } from '../../domain/export-enums';
import { ReportExportOrmEntity } from '../../infrastructure/persistence/typeorm/entities/report-export.orm-entity';
import { ReportFileStore } from '../../infrastructure/report-file-store';
import { ADMIN_DIRECTORY, IAdminDirectory } from '../ports/admin-directory.port';
import { IReportNotifier, REPORT_NOTIFIER } from '../ports/report-notifier.port';
import { RawReportParams } from './report-params';
import { ReportContentService } from './report-content.service';
import { ReportSerializerService } from './report-serializer.service';

export interface CreateExportCommand {
  reportKey: string;
  params: RawReportParams;
  format: ExportFormat;
  adminId: string;
}

/**
 * Async report export (FR-RPT-070/072). A request inserts a `processing` row and returns immediately
 * (`202`); the heavy render runs out of band (`setImmediate`) so large datasets never block the request.
 * On completion the row flips to `ready` with an expiring `file_url` and the requesting admin is notified
 * via NOTIF; a render failure flips it to `failed` (the reason is kept server-side only). Read-only over
 * source data (BR-RPT-5). The export is permission-scoped by the controller's `reports.report.export` gate
 * (FR-RPT-072); finer per-report scoping is not modelled (all reports share the single view permission).
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectRepository(ReportExportOrmEntity) private readonly exports: Repository<ReportExportOrmEntity>,
    private readonly content: ReportContentService,
    private readonly serializer: ReportSerializerService,
    private readonly fileStore: ReportFileStore,
    @Inject(REPORT_NOTIFIER) private readonly notifier: IReportNotifier,
    @Inject(ADMIN_DIRECTORY) private readonly admins: IAdminDirectory,
  ) {}

  /** Validate + enqueue an export; returns the freshly-created `processing` row. */
  async createExport(command: CreateExportCommand): Promise<ReportExportOrmEntity> {
    if (!isReportKey(command.reportKey)) {
      throw new BadRequestException({
        code: 'UNKNOWN_REPORT',
        message: `Unknown report_key \`${command.reportKey}\`.`,
      });
    }
    const row = this.exports.create({
      reportKey: command.reportKey,
      params: command.params ?? {},
      format: command.format,
      status: ExportStatus.PROCESSING,
      requestedByAdminId: command.adminId,
      fileUrl: null,
      expiresAt: null,
    });
    const saved = await this.exports.save(row);
    // Process out of band so the request returns `202` immediately (FR-RPT-070, §12.5).
    setImmediate(() => {
      void this.processExport(saved.id);
    });
    return saved;
  }

  async getExport(id: string): Promise<ReportExportOrmEntity> {
    const row = await this.exports.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'EXPORT_NOT_FOUND', message: 'Export not found.' });
    return row;
  }

  /** Render → serialize → store → mark ready → notify. Failures are isolated and recorded. */
  async processExport(id: string, now: Date = new Date()): Promise<void> {
    const row = await this.exports.findOne({ where: { id } });
    if (!row || row.status !== ExportStatus.PROCESSING) return;
    try {
      const table = await this.content.render(row.reportKey as ReportKey, row.params, now);
      const file = await this.serializer.serialize(table, row.format);
      const stored = await this.fileStore.save(row.id, row.reportKey, file, now);
      row.status = ExportStatus.READY;
      row.fileUrl = stored.fileUrl;
      row.expiresAt = stored.expiresAt;
      await this.exports.save(row);
      await this.notifyReady(row);
    } catch (err) {
      row.status = ExportStatus.FAILED;
      row.errorReason = (err as Error).message;
      await this.exports.save(row);
      this.logger.error(`Export ${id} failed: ${(err as Error).message}`);
    }
  }

  private async notifyReady(row: ReportExportOrmEntity): Promise<void> {
    const [recipient] = await this.admins.resolve([row.requestedByAdminId]);
    await this.notifier.notify('report.export_ready', {
      adminId: row.requestedByAdminId,
      email: recipient?.email ?? null,
      reportKey: row.reportKey,
      fileUrl: row.fileUrl,
      refId: row.id,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    });
  }
}
