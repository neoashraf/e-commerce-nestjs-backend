import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AttributeFamilyOrmEntity } from './attribute-family.orm-entity';
import { AttributeGroupOrmEntity } from './attribute-group.orm-entity';
import { AttributeOrmEntity } from './attribute.orm-entity';

/**
 * ORM mapping for `family_attributes` (SRS 02 §8 FamilyAttribute): the family ↔ attribute
 * link via a group, ordered by `position`. Unique on (family_id, attribute_id) — an attribute
 * appears at most once per family.
 */
@Entity('family_attributes')
@Index(['familyId'])
@Index(['groupId'])
@Index(['familyId', 'attributeId'], { unique: true })
export class FamilyAttributeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id' })
  familyId: string;

  @ManyToOne(() => AttributeFamilyOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family: AttributeFamilyOrmEntity;

  @Column({ name: 'group_id' })
  groupId: string;

  @ManyToOne(() => AttributeGroupOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'group_id' })
  group: AttributeGroupOrmEntity;

  @Column({ name: 'attribute_id' })
  attributeId: string;

  @ManyToOne(() => AttributeOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: AttributeOrmEntity;

  @Column({ type: 'int', default: 0 })
  position: number;
}
