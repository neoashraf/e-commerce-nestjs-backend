import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `cms_menu_items` (SRS 13 §8 MenuItem) — header/footer navigation, one level of
 * nesting via `parent_id`. Links to a category/page/url. `cms-pages-be`'s PAGE_LINKED guard reads this
 * table (link_type='page' + link_ref=slug on published items).
 */
@Entity('cms_menu_items')
@Index(['menu'])
@Index(['parentId'])
export class MenuItemOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 16 })
  menu: string; // header | footer

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @Column({ length: 60 })
  label: string;

  @Column({ name: 'link_type', length: 16 })
  linkType: string; // category | page | url

  @Column({ name: 'link_ref', length: 255 })
  linkRef: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_published', default: true })
  isPublished: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
