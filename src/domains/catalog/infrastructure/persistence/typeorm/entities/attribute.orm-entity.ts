import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AttributeOptionOrmEntity } from './attribute-option.orm-entity';

/** ORM mapping for `attributes` (SRS 02 §8 Attribute). snake_case columns; UUID PK. */
@Entity('attributes')
@Index(['type'])
export class AttributeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 60 })
  code: string;

  @Column({ name: 'admin_label', length: 80 })
  adminLabel: string;

  @Column({ length: 20 })
  type: string;

  @Column({ name: 'is_required', default: false })
  isRequired: boolean;

  @Column({ name: 'is_unique', default: false })
  isUnique: boolean;

  @Column({ name: 'is_filterable', default: false })
  isFilterable: boolean;

  @Column({ name: 'is_configurable', default: false })
  isConfigurable: boolean;

  @Column({ name: 'is_visible_on_front', default: true })
  isVisibleOnFront: boolean;

  @Column({ name: 'is_comparable', default: false })
  isComparable: boolean;

  @Column({ name: 'is_user_defined', default: true })
  isUserDefined: boolean;

  @Column({ type: 'varchar', length: 120, nullable: true })
  validation: string | null;

  @Column({ name: 'default_value', type: 'varchar', length: 160, nullable: true })
  defaultValue: string | null;

  @Column({ default: 0 })
  position: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => AttributeOptionOrmEntity, (option) => option.attribute)
  options: AttributeOptionOrmEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
