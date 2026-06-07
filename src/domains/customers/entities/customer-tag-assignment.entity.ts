import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CustomerTagAssignment (SRS 12 §8) — the join between a customer and a tag. Idempotent: a unique
 * `(customer_id, tag_id)` makes re-adding a no-op (FR-CUST-031, §12.9). Records who tagged + when.
 */
@Entity('customer_tag_assignments')
@Index(['customerId'])
@Index(['tagId'])
@Index('uq_customer_tag_assignment', ['customerId', 'tagId'], { unique: true })
export class CustomerTagAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @Column({ name: 'assigned_by_admin_id', type: 'uuid' })
  assignedByAdminId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
