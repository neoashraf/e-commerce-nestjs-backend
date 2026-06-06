import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CustomerNote (SRS 12 §8). An internal, append-only admin annotation on a customer — never surfaced to
 * the customer (FR-CUST-030, BR-CUST-7). No update/delete path.
 */
@Entity('customer_notes')
@Index(['customerId'])
export class CustomerNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'admin_id', type: 'uuid' })
  adminId: string;

  @Column({ type: 'text' })
  body: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
