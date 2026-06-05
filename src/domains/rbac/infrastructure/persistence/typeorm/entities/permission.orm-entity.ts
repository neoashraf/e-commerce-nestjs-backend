import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Seeded, read-only permission catalog (SRS 16 §8 Permission). Code is the PK. */
@Entity('permissions')
export class PermissionOrmEntity {
  @PrimaryColumn({ length: 80 })
  code: string;

  @Index()
  @Column({ length: 40 })
  module: string;

  @Column({ length: 160 })
  description: string;
}
