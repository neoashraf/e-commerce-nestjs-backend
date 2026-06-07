import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `geo_areas` (SRS 04 §8 GeoArea). snake_case columns; UUID PK. `(district,
 * upazila)` is unique so zone resolution (FR-CART-046) is deterministic. Reference data — no
 * soft delete; `is_active` toggles selectability in address forms.
 */
@Entity('geo_areas')
@Index(['division'])
@Index(['district'])
export class GeoAreaOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 40 })
  division: string;

  @Column({ length: 40 })
  district: string;

  @Column({ length: 60 })
  upazila: string;

  @Column({ name: 'delivery_zone', length: 16 })
  deliveryZone: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 10, nullable: true })
  postalCode: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
