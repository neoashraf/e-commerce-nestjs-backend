import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CustomerTag (SRS 12 §8). A segmentation label in the tag catalog (e.g. `vip`, `wholesale`, `blocked`)
 * applied to customers for filtering/operations (FR-CUST-031). `key` is unique (§11 tag rule).
 */
@Entity('customer_tags')
export class CustomerTagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 40 })
  key: string;

  @Column({ length: 60 })
  label: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  color: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
