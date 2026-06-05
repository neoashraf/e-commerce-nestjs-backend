import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AttributeGroupOrmEntity } from './attribute-group.orm-entity';

/** ORM mapping for `attribute_families` (SRS 02 §8 AttributeFamily). snake_case columns; UUID PK. */
@Entity('attribute_families')
export class AttributeFamilyOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 60 })
  code: string;

  @Column({ length: 80 })
  name: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @OneToMany(() => AttributeGroupOrmEntity, (group) => group.family)
  groups: AttributeGroupOrmEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
