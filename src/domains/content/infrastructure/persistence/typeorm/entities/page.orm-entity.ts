import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `cms_pages` (SRS 13 §8 Page) — a static rich-text page identified by a stable, unique
 * slug, with SEO meta + a publish flag. `is_system` marks a seeded BD policy page (delete-protected,
 * FR-CMS-043). Soft-delete via `deleted_at`. Body is sanitized HTML (storefront renders XSS-safe).
 */
@Entity('cms_pages')
export class PageOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 140 })
  slug: string;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'seo_title', length: 160, nullable: true })
  seoTitle: string | null;

  @Column({ name: 'seo_description', length: 300, nullable: true })
  seoDescription: string | null;

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ name: 'is_system', default: false })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
