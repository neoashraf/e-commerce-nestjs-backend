import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';

/** Storefront product card (matches ProductCardDto / the contract data.products[] shape). */
export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  primary_image: string | null;
  effective_price: string;
  base_price: string;
  on_sale: boolean;
  currency: 'BDT';
  availability: string;
}

/** Raw row shape (snake_case DB columns) returned by the featured raw-SQL join. */
interface ShowcaseRawRow {
  product_id: string;
  slug: string;
  title: string;
  brand: string | null;
  primary_image: string | null;
  effective_price: string;
  base_price: string;
  on_sale: boolean;
  availability: string;
}

const NEW_LIMIT = 20;
const BEST_SELLING_LIMIT = 20;

/**
 * Order statuses that count as a real sale for the best-seller ranking — everything past
 * confirmation. Excludes `pending_payment` (not yet a sale), `cancelled`, and `refunded`.
 */
const SOLD_STATUSES = [
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'exchange_requested',
  'exchanged',
];

/**
 * Storefront product showcases (home page): featured (paginated), new arrivals (latest 20), and
 * best sellers (top 20 by units sold). All read the denormalized, published-only
 * `product_search_document` mirror for the card fields (price/image/availability precomputed), so an
 * unpublished/soft-deleted product never surfaces. Read-only; stock/price stay owned by INV/CAT.
 */
@Injectable()
export class ShowcaseService {
  constructor(
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly docs: Repository<ProductSearchDocumentOrmEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** All featured + published products, newest first, paginated (default 20/page). */
  async featured(page: number, limit: number): Promise<Paginated<ProductCard>> {
    const where = `p.is_featured = true AND p.deleted_at IS NULL`;
    const rows: ShowcaseRawRow[] = await this.dataSource.query(
      `SELECT doc.product_id, doc.slug, doc.title, doc.brand, doc.primary_image,
              doc.effective_price, doc.base_price, doc.on_sale, doc.availability
       FROM product_search_document doc
       JOIN products p ON p.id = doc.product_id
       WHERE ${where}
       ORDER BY doc.published_at DESC NULLS LAST, doc.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, (page - 1) * limit],
    );
    const countRows: Array<{ count: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM product_search_document doc
       JOIN products p ON p.id = doc.product_id
       WHERE ${where}`,
    );
    const total = countRows[0]?.count ?? 0;
    return new Paginated(
      rows.map((r) => this.rawToCard(r)),
      { page, limit, total },
    );
  }

  /** The most recently published products (newest first), capped at 20. */
  async newArrivals(): Promise<ProductCard[]> {
    const rows = await this.docs
      .createQueryBuilder('doc')
      .orderBy('doc.published_at', 'DESC', 'NULLS LAST')
      .addOrderBy('doc.created_at', 'DESC')
      .take(NEW_LIMIT)
      .getMany();
    return rows.map((d) => this.toCard(d));
  }

  /**
   * Top sellers: products ranked by total units sold across real (non-cancelled, non-pending) orders.
   * Aggregates `order_items` joined to `orders`, takes the top 20 product ids, then hydrates their
   * cards from the published mirror (so an unpublished best seller is simply skipped), preserving the
   * sold-desc order.
   */
  async bestSelling(): Promise<ProductCard[]> {
    const top: Array<{ product_id: string }> = await this.dataSource.query(
      `SELECT oi.product_id AS product_id, SUM(oi.quantity)::int AS sold
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.status = ANY($1)
       GROUP BY oi.product_id
       ORDER BY sold DESC, MAX(o.created_at) DESC
       LIMIT $2`,
      [SOLD_STATUSES, BEST_SELLING_LIMIT],
    );
    const ids = top.map((r) => r.product_id);
    if (ids.length === 0) return [];

    const docs = await this.docs.find({ where: { productId: In(ids) } });
    const byId = new Map(docs.map((d) => [d.productId, d]));
    return ids
      .map((id) => byId.get(id))
      .filter((d): d is ProductSearchDocumentOrmEntity => d !== undefined)
      .map((d) => this.toCard(d));
  }

  private rawToCard(r: ShowcaseRawRow): ProductCard {
    return {
      id: r.product_id,
      slug: r.slug,
      title: r.title,
      brand: r.brand,
      primary_image: r.primary_image,
      effective_price: r.effective_price,
      base_price: r.base_price,
      on_sale: r.on_sale,
      currency: 'BDT',
      availability: r.availability,
    };
  }

  private toCard(d: ProductSearchDocumentOrmEntity): ProductCard {
    return {
      id: d.productId,
      slug: d.slug,
      title: d.title,
      brand: d.brand,
      primary_image: d.primaryImage,
      effective_price: d.effectivePrice,
      base_price: d.basePrice,
      on_sale: d.onSale,
      currency: 'BDT',
      availability: d.availability,
    };
  }
}
