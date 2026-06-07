import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** ORM mapping for `product_videos` (SRS 02 §8 ProductVideo, FR-CAT-034). `source` is `upload`
 * (stored file URL) or `url` (external). Ordered after images by `display_order`. */
@Entity('product_videos')
@Index(['productId'])
export class ProductVideoOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ length: 10 })
  source: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
