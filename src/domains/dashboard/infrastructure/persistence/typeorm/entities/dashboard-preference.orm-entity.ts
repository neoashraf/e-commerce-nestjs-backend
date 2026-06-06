import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Optional per-admin dashboard layout preference (SRS 10 §8 DashboardPreference, FR-DASH-031).
 * One row per admin (`admin_user_id` unique). DASH stores no business data — this is the only
 * table it owns. `widget_order` / `hidden_widgets` reference widget keys from the widget catalog
 * (validated on write — §11; unknown key → `400`).
 */
@Entity('dashboard_preferences')
export class DashboardPreferenceOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'admin_user_id', type: 'uuid', unique: true })
  adminUserId: string;

  @Column({ name: 'default_period', type: 'varchar', length: 16, default: 'last_7d' })
  defaultPeriod: string;

  @Column({ name: 'widget_order', type: 'jsonb', nullable: true })
  widgetOrder: string[] | null;

  @Column({ name: 'hidden_widgets', type: 'jsonb', nullable: true })
  hiddenWidgets: string[] | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
