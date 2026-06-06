import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** ORM mapping for `cms_slides` (SRS 13 §8 Slide) — homepage hero carousel slide. Soft-delete + schedule. */
@Entity('cms_slides')
export class SlideOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'image_url', length: 500 })
  imageUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  renditions: Record<string, string> | null;

  @Column({ name: 'alt_text', length: 160 })
  altText: string;

  @Column({ length: 120, nullable: true })
  headline: string | null;

  @Column({ length: 200, nullable: true })
  subtext: string | null;

  @Column({ name: 'cta_label', length: 40, nullable: true })
  ctaLabel: string | null;

  @Column({ name: 'link_type', length: 16 })
  linkType: string; // category | product | page | url

  @Column({ name: 'link_ref', length: 255 })
  linkRef: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_published', default: false })
  isPublished: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date | null;
}
