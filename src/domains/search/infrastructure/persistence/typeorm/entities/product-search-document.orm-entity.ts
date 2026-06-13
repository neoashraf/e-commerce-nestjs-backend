import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * ORM mapping for `product_search_document` (SRS 03 §8 ProductSearchDocument) — the denormalized,
 * query-optimized **mirror** of one published CAT product, projected by `SearchIndexer`. It owns NO
 * source truth (price/stock/catalog live in CAT/INV); the reindex hooks refresh it. `search_text` is
 * the concatenated weighted searchable text; the migration adds a maintained `tsvector` column +
 * GIN (FTS) and `pg_trgm` GIN (fuzzy) indexes over it. Array/jsonb columns hold the facetable
 * projections SRCH and the facets sibling read.
 */
@Entity('product_search_document')
@Index(['categoryIds'])
export class ProductSearchDocumentOrmEntity {
  /** One row per product — the product id is the PK (mirror, FR-SRCH-070). */
  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ length: 200 })
  slug: string;

  @Column({ length: 180 })
  title: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ name: 'category_path', type: 'text', nullable: true })
  categoryPath: string | null;

  /** Weighted concatenation (title > brand > category > attributes) for FTS + trigram matching. */
  @Column({ name: 'search_text', type: 'text', default: '' })
  searchText: string;

  @Column({ name: 'primary_image', type: 'varchar', length: 500, nullable: true })
  primaryImage: string | null;

  // --- RW6 product-card projections (denormalized from CAT; see SearchIndexer.project) -----------

  /** Optional Bangla product name (mirrors Product.name_bn). */
  @Column({ name: 'name_bn', type: 'varchar', length: 180, nullable: true })
  nameBn: string | null;

  /** Second listing-rendition image (next after primary by display_order), for the desktop hover cross-fade. */
  @Column({ name: 'hover_image', type: 'varchar', length: 500, nullable: true })
  hoverImage: string | null;

  /** Colourways flattened from the product's `color` attribute options + color-tagged images (≤6). */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  swatches: { image: string; label: string; color_hex: string | null }[];

  /** True for `configurable` products (card shows "Choose size"), false for `simple` ("Add to bag"). */
  @Column({ name: 'requires_variant', default: false })
  requiresVariant: boolean;

  /** Light text merch label: `new` (from is_new) | `bestSeller` | `authentic` | null (no source yet). */
  @Column({ name: 'merch_label', type: 'varchar', length: 16, nullable: true })
  merchLabel: 'new' | 'bestSeller' | 'authentic' | null;

  @Column({ name: 'effective_price', type: 'decimal', precision: 12, scale: 2 })
  effectivePrice: string;

  @Column({ name: 'base_price', type: 'decimal', precision: 12, scale: 2 })
  basePrice: string;

  @Column({ name: 'on_sale', default: false })
  onSale: boolean;

  @Column({ length: 16, default: 'in_stock' })
  availability: string;

  @Column({ name: 'best_selling_score', type: 'double precision', default: 0 })
  bestSellingScore: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** primary + browsing category ids, for descendant browse (uuid[]). */
  @Column({ name: 'category_ids', type: 'uuid', array: true, default: () => "'{}'" })
  categoryIds: string[];

  /** Filterable attribute values keyed by Attribute.code (jsonb: code → option labels[]). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  attributes: Record<string, string[]>;

  /** Enabled-variant color option ids (term[] for the color facet). */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  colors: string[];

  /** Enabled-variant size option ids (term[] for the size facet). */
  @Column({ type: 'uuid', array: true, default: () => "'{}'" })
  sizes: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
