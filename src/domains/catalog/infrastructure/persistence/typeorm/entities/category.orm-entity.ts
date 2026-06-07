import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { CategoryFilterableAttributeOrmEntity } from './category-filterable-attribute.orm-entity';

/** ORM mapping for `categories` (SRS 02 §8 Category). snake_case columns; UUID PK; soft-delete. */
@Entity('categories')
@Index(['parentId'])
export class CategoryOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 140 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  @Column({ name: 'banner_url', type: 'varchar', length: 500, nullable: true })
  bannerUrl: string | null;

  @Column({ name: 'display_mode', length: 32, default: 'products_and_description' })
  displayMode: string;

  @Column({ default: 0 })
  position: number;

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ name: 'show_in_menu', default: true })
  showInMenu: boolean;

  @Column({ default: 1 })
  level: number;

  @Column({ name: 'slug_locked', default: false })
  slugLocked: boolean;

  @Column({ name: 'meta_title', type: 'varchar', length: 160, nullable: true })
  metaTitle: string | null;

  @Column({ name: 'meta_keywords', type: 'varchar', length: 255, nullable: true })
  metaKeywords: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 320, nullable: true })
  metaDescription: string | null;

  @OneToMany(
    () => CategoryFilterableAttributeOrmEntity,
    (link) => link.category,
  )
  filterableAttributes: CategoryFilterableAttributeOrmEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
