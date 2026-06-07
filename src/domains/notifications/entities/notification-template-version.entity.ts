import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Append-only snapshot of every template version (BR-NOTIF-6, FR-NOTIF-012). On create a v1
 * row is written; each PATCH appends the new version's content. A previously-sent notification
 * carries `template_id` + `template_version`, which resolves back to the exact historical
 * subject/body here even after the live template is edited — historical messages never change.
 */
@Entity('notification_template_versions')
@Index(['templateId'])
@Index(['templateId', 'version'], { unique: true })
export class NotificationTemplateVersionEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ length: 255, type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'updated_by_admin_id', type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
