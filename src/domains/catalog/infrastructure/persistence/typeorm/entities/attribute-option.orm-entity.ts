import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AttributeOrmEntity } from './attribute.orm-entity';

/** ORM mapping for `attribute_options` (SRS 02 §8 AttributeOption). Unique value per attribute. */
@Entity('attribute_options')
@Index(['attributeId'])
@Index(['attributeId', 'value'], { unique: true })
export class AttributeOptionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attribute_id' })
  attributeId: string;

  @ManyToOne(() => AttributeOrmEntity, (attribute) => attribute.options, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: AttributeOrmEntity;

  @Column({ length: 60 })
  value: string;

  @Column({ length: 80 })
  label: string;

  @Column({ name: 'swatch_type', type: 'varchar', length: 10, nullable: true })
  swatchType: string | null;

  @Column({ name: 'swatch_value', type: 'varchar', length: 120, nullable: true })
  swatchValue: string | null;

  @Column({ default: 0 })
  position: number;
}
