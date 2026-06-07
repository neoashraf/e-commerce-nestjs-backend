import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AttributeFamilyOrmEntity } from './attribute-family.orm-entity';

/** ORM mapping for `attribute_groups` (SRS 02 §8 AttributeGroup). Ordered groups per family. */
@Entity('attribute_groups')
@Index(['familyId'])
export class AttributeGroupOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'family_id' })
  familyId: string;

  @ManyToOne(() => AttributeFamilyOrmEntity, (family) => family.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'family_id' })
  family: AttributeFamilyOrmEntity;

  @Column({ length: 80 })
  name: string;

  // `column` is a reserved SQL word; TypeORM quotes the identifier in generated queries.
  @Column({ name: 'column', type: 'int', default: 1 })
  layoutColumn: number;

  @Column({ type: 'int', default: 0 })
  position: number;
}
