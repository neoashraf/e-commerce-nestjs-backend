import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** Append-only audit/security event (SRS 16 §8 AuditEntry). No updated_at — immutable. */
@Entity('audit_entries')
@Index(['actorAdminId'])
@Index(['action'])
@Index(['entityType'])
@Index(['createdAt'])
export class AuditEntryOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'actor_admin_id', type: 'uuid', nullable: true })
  actorAdminId: string | null;

  @Column({ length: 80 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 60, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  summary: Record<string, unknown>;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 20 })
  result: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
