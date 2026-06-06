import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { CustomerExportStatus } from '../customers.enums';

/**
 * Async customer-list export job (FR-CUST-040, §12.7). Not in the SRS §8 annotation set, but required to
 * back the `POST /export` (202) → `GET /export/{id}` status/download contract — mirrors RPT's
 * `report_exports`. Stores the requested filters/fields, never any customer secrets.
 */
@Entity('customer_exports')
export class CustomerExportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requested_by_admin_id', type: 'uuid' })
  requestedByAdminId: string;

  @Column({ type: 'jsonb' })
  filters: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  fields: string[];

  @Column({
    type: 'enum',
    enum: CustomerExportStatus,
    enumName: 'customer_export_status_enum',
    default: CustomerExportStatus.PROCESSING,
  })
  status: CustomerExportStatus;

  @Column({ name: 'file_url', type: 'varchar', length: 500, nullable: true })
  fileUrl: string | null;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount: number | null;

  @Column({ name: 'error_reason', type: 'varchar', length: 500, nullable: true })
  errorReason: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
