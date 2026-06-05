import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { AttributeOrmEntity } from './attribute.orm-entity';
import { CategoryOrmEntity } from './category.orm-entity';

/**
 * ORM mapping for `category_filterable_attributes` (SRS 02 §8): the filterable attributes chosen
 * for a category's layered navigation (FR-CAT-009). Unique on (category_id, attribute_id).
 */
@Entity('category_filterable_attributes')
@Index(['categoryId'])
@Index(['categoryId', 'attributeId'], { unique: true })
export class CategoryFilterableAttributeOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'attribute_id', type: 'uuid' })
  attributeId: string;

  @Column({ default: 0 })
  position: number;

  @ManyToOne(() => CategoryOrmEntity, (category) => category.filterableAttributes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: CategoryOrmEntity;

  @ManyToOne(() => AttributeOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_id' })
  attribute: AttributeOrmEntity;
}
