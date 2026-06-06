import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** ORM mapping for `cms_home_sections` (SRS 13 §8 HomeSection) — a curated homepage block. */
@Entity('cms_home_sections')
export class HomeSectionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32 })
  type: string; // featured_categories | featured_products

  @Column({ length: 120 })
  title: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  /** Ordered category ids or product ids referenced by this section. */
  @Column({ name: 'item_refs', type: 'uuid', array: true, default: () => "'{}'" })
  itemRefs: string[];

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
