import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ScheduleCadence } from '../../../../domain/export-enums';

/**
 * `scheduled_reports` (SRS 15 §8 `ScheduledReport`): a recurring report digest — the report + a params
 * template (e.g. `{ "range": "last_7d" }`), the cadence, and the admin recipients emailed via NOTIF
 * (FR-RPT-071). `last_run_at` records the last execution; `last_run_skipped_admin_ids` flags recipients
 * skipped because they were suspended at send time (SRS 15 §12.11 — "schedule flags the inactive recipient").
 */
@Entity('scheduled_reports')
export class ScheduledReportOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'report_key', length: 60 })
  reportKey: string;

  @Column({ type: 'jsonb' })
  params: Record<string, unknown>;

  @Column({ type: 'enum', enum: ScheduleCadence })
  cadence: ScheduleCadence;

  @Column({ name: 'recipients_admin_ids', type: 'uuid', array: true })
  recipientsAdminIds: string[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  /** Recipients skipped on the last run because they were suspended (FR-RPT-071, §12.11). */
  @Column({ name: 'last_run_skipped_admin_ids', type: 'uuid', array: true, nullable: true })
  lastRunSkippedAdminIds: string[] | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
