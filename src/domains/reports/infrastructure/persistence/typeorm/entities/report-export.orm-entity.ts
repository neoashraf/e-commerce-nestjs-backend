import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { ExportFormat, ExportStatus } from '../../../../domain/export-enums';

/**
 * `report_exports` (SRS 15 §8 `ReportExport`): a single async report export — the named report + the
 * params it was rendered with, the output format, the processing status, and (once ready) a download
 * `file_url` with an `expires_at` link expiry (FR-RPT-070). `requested_by_admin_id` ties the export to
 * the admin who asked for it (permission scoping + export-ready notification).
 */
@Entity('report_exports')
@Index(['requestedByAdminId'])
export class ReportExportOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_key', length: 60 })
  reportKey: string;

  @Column({ type: 'jsonb' })
  params: Record<string, unknown>;

  @Column({ type: 'enum', enum: ExportFormat })
  format: ExportFormat;

  @Column({ type: 'enum', enum: ExportStatus, default: ExportStatus.PROCESSING })
  status: ExportStatus;

  @Column({ name: 'file_url', type: 'text', nullable: true })
  fileUrl: string | null;

  /** Failure reason when `status = failed` (operator diagnostics; never returned to the client). */
  @Column({ name: 'error_reason', type: 'text', nullable: true })
  errorReason: string | null;

  @Column({ name: 'requested_by_admin_id', type: 'uuid' })
  requestedByAdminId: string;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
