import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ProductImageOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import {
  IProductSnapshotReader,
  ProductSnapshotView,
} from '../../application/ports/product-snapshot.port';

/**
 * CAT-backed adapter for the orders → catalog presentation read seam (RW6). Resolves each order item's
 * `product_id` to the current product's Bangla title (`name_bn`) + a listing-rendition thumbnail (the
 * product's primary image, else its first image). Read-time + batched (no N+1); a deleted product or one
 * with no image simply yields `null` for that field. Reads CAT repositories directly — the same
 * read-only cross-domain pattern the search indexer uses; it writes nothing.
 */
@Injectable()
export class ProductSnapshotAdapter implements IProductSnapshotReader {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
  ) {}

  async getByProductIds(productIds: string[]): Promise<Map<string, ProductSnapshotView>> {
    const result = new Map<string, ProductSnapshotView>();
    const ids = Array.from(new Set(productIds)).filter(Boolean);
    if (ids.length === 0) return result;

    const products = await this.products.find({
      where: { id: In(ids) },
      withDeleted: true, // a historical order may reference a since-deleted product
      select: { id: true, nameBn: true, primaryImageId: true },
    });
    if (products.length === 0) return result;

    // One representative image per product: the primary if set, else the first by display_order.
    const images = await this.images.find({
      where: { productId: In(products.map((p) => p.id)) },
      order: { isPrimary: 'DESC', displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const imageByProduct = new Map<string, ProductImageOrmEntity>();
    const imageById = new Map<string, ProductImageOrmEntity>();
    for (const img of images) {
      imageById.set(img.id, img);
      if (!imageByProduct.has(img.productId)) imageByProduct.set(img.productId, img);
    }

    const thumb = (img: ProductImageOrmEntity | undefined): string | null =>
      img ? (img.renditions?.listing ?? img.url ?? null) : null;

    for (const p of products) {
      const primary = (p.primaryImageId && imageById.get(p.primaryImageId)) || imageByProduct.get(p.id);
      result.set(p.id, {
        product_image: thumb(primary),
        product_title_bn: p.nameBn ?? null,
      });
    }
    return result;
  }
}
