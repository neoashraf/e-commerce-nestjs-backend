import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** ORM mapping for `cms_banners` (SRS 13 §8 Banner) — a promotional image in a named placement slot. */
@Entity('cms_banners')
@Index(['placement'])
export class BannerOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 32 })
  placement: string; // home_top | home_mid | category_top | footer | …

  @Column({ name: 'image_url', length: 500 })
  imageUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  renditions: Record<string, string> | null;

  @Column({ name: 'alt_text', length: 160 })
  altText: string;

  @Column({ name: 'link_type', length: 16 })
  linkType: string; // category | product | page | url

  @Column({ name: 'link_ref', length: 255 })
  linkRef: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

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
