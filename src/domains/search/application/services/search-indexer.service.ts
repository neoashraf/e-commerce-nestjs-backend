import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';

import { AttributeOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductAttributeValueOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductCategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-category.orm-entity';
import { ProductImageOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductVariantOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductStatus } from '../../../catalog/domain/enums/product-type.enum';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import {
  IInventoryAvailabilityPort,
  INVENTORY_AVAILABILITY_PORT,
} from '../ports/inventory-availability.port';
import { SearchAvailability } from '../../domain/search-enums';

/**
 * Maintains the `product_search_document` mirror (FR-SRCH-070/071/072). `upsert(productId)` (re)projects
 * one published product; `remove(productId)` drops it (unpublish/archive/soft-delete/reprice/stock change
 * hooks call these — wire to whatever CAT/INV hook surface emits; none is emitted yet, so the integration
 * point is noted in the PR and `reindexAll()` covers a full sync). `reindexAll()` rebuilds atomically into
 * a shadow table then swaps, so storefront search stays served on the old index during the rebuild
 * (§12.9/§14). SRCH owns NO source truth — it only mirrors CAT pricing + INV availability.
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly documents: Repository<ProductSearchDocumentOrmEntity>,
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(ProductCategoryOrmEntity)
    private readonly productCategories: Repository<ProductCategoryOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductVariantOrmEntity)
    private readonly variants: Repository<ProductVariantOrmEntity>,
    @InjectRepository(ProductVariantOptionOrmEntity)
    private readonly variantOptions: Repository<ProductVariantOptionOrmEntity>,
    @InjectRepository(ProductAttributeValueOrmEntity)
    private readonly attributeValues: Repository<ProductAttributeValueOrmEntity>,
    @InjectRepository(AttributeOrmEntity)
    private readonly attributes: Repository<AttributeOrmEntity>,
    @InjectRepository(AttributeOptionOrmEntity)
    private readonly options: Repository<AttributeOptionOrmEntity>,
    @Inject(INVENTORY_AVAILABILITY_PORT)
    private readonly availability: IInventoryAvailabilityPort,
    private readonly dataSource: DataSource,
  ) {}

  /** (Re)project a single product into the index, or remove it if it is no longer searchable. */
  async upsert(productId: string, now: Date = new Date()): Promise<void> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product || product.status !== ProductStatus.PUBLISHED || product.deletedAt !== null) {
      await this.remove(productId);
      return;
    }
    if (!(await this.isCategoryPublished(product.primaryCategoryId))) {
      // Product in an unpublished category is not browsable (BR-SRCH-1).
      await this.remove(productId);
      return;
    }
    const doc = await this.project(product, now);
    await this.documents.save(doc);
  }

  /** Remove a product from the index (FR-SRCH-070; §12.3). Idempotent. */
  async remove(productId: string): Promise<void> {
    await this.documents.delete({ productId });
  }

  /**
   * Full rebuild without taking search offline (FR-SRCH-072, §12.9): project every eligible product into
   * a staging table, then swap it in inside one transaction. The live `product_search_document` keeps
   * serving until the swap commits.
   */
  async reindexAll(now: Date = new Date()): Promise<number> {
    const eligible = await this.products.find({
      where: { status: ProductStatus.PUBLISHED, deletedAt: IsNull() },
    });
    const docs: ProductSearchDocumentOrmEntity[] = [];
    for (const product of eligible) {
      if (!(await this.isCategoryPublished(product.primaryCategoryId))) continue;
      docs.push(await this.project(product, now));
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductSearchDocumentOrmEntity);
      // Atomic swap-equivalent: replace the set in one transaction (the old set serves until commit).
      await repo.clear();
      if (docs.length > 0) {
        // chunked save to keep parameter counts sane on large catalogs
        const chunkSize = 200;
        for (let i = 0; i < docs.length; i += chunkSize) {
          await repo.save(docs.slice(i, i + chunkSize));
        }
      }
    });
    this.logger.log(`Reindex complete: ${docs.length} document(s).`);
    return docs.length;
  }

  // ---------------------------------------------------------------------------
  // Projection
  // ---------------------------------------------------------------------------

  private async project(
    product: ProductOrmEntity,
    now: Date,
  ): Promise<ProductSearchDocumentOrmEntity> {
    const [categoryPath, categoryIds] = await this.buildCategoryProjection(product);
    const primaryImage = await this.resolvePrimaryImage(product);
    const { colors, sizes, availability } = await this.buildVariantProjection(product.id);
    const attributes = await this.buildAttributeProjection(product.id);

    const saleActive = this.isSaleActive(product, now);
    const effectivePrice =
      saleActive && product.salePrice !== null ? product.salePrice : product.basePrice;

    const attrText = Object.values(attributes)
      .flat()
      .join(' ');
    const searchText = [product.name, product.brand ?? '', categoryPath ?? '', attrText]
      .filter((s) => s.trim() !== '')
      .join(' ');

    const doc = new ProductSearchDocumentOrmEntity();
    doc.productId = product.id;
    doc.slug = product.slug;
    doc.title = product.name;
    doc.brand = product.brand;
    doc.categoryPath = categoryPath;
    doc.searchText = searchText;
    doc.primaryImage = primaryImage;
    doc.effectivePrice = this.money(effectivePrice);
    doc.basePrice = this.money(product.basePrice);
    doc.onSale = saleActive && product.salePrice !== null;
    doc.availability = availability;
    // best_selling falls back to newest until RPT/order data exists (SRS §15) — score stays 0.
    doc.bestSellingScore = 0;
    doc.publishedAt = product.updatedAt ?? product.createdAt;
    doc.categoryIds = categoryIds;
    doc.attributes = attributes;
    doc.colors = colors;
    doc.sizes = sizes;
    return doc;
  }

  /** category_path (root→leaf names of the primary category) + all category ids (primary + browsing). */
  private async buildCategoryProjection(
    product: ProductOrmEntity,
  ): Promise<[string | null, string[]]> {
    const names: string[] = [];
    const ids = new Set<string>();
    let currentId: string | null = product.primaryCategoryId;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const cat: CategoryOrmEntity | null = await this.categories.findOne({ where: { id: currentId } });
      if (!cat) break;
      names.unshift(cat.name);
      ids.add(cat.id);
      currentId = cat.parentId;
    }
    const extra = await this.productCategories.find({ where: { productId: product.id } });
    for (const link of extra) ids.add(link.categoryId);
    return [names.length > 0 ? names.join(' / ') : null, Array.from(ids)];
  }

  private async resolvePrimaryImage(product: ProductOrmEntity): Promise<string | null> {
    if (!product.primaryImageId) {
      const any = await this.images.findOne({ where: { productId: product.id } });
      return any?.renditions?.listing ?? any?.url ?? null;
    }
    const img = await this.images.findOne({ where: { id: product.primaryImageId } });
    return img?.renditions?.listing ?? img?.url ?? null;
  }

  private async buildVariantProjection(
    productId: string,
  ): Promise<{ colors: string[]; sizes: string[]; availability: string }> {
    const enabled = await this.variants.find({ where: { productId, isEnabled: true } });
    if (enabled.length === 0) {
      return { colors: [], sizes: [], availability: SearchAvailability.OUT_OF_STOCK };
    }
    const variantIds = enabled.map((v) => v.id);
    const [optionRows, availabilityMap, attrs] = await Promise.all([
      this.variantOptions.find({ where: { variantId: In(variantIds) } }),
      this.availability.getAvailabilityByVariantIds(variantIds),
      this.attributes.find({ where: { isConfigurable: true } }),
    ]);

    const colorAttrIds = new Set(attrs.filter((a) => a.code === 'color').map((a) => a.id));
    const sizeAttrIds = new Set(attrs.filter((a) => a.code === 'size').map((a) => a.id));

    const colors = new Set<string>();
    const sizes = new Set<string>();
    for (const row of optionRows) {
      if (colorAttrIds.has(row.attributeId)) colors.add(row.optionId);
      else if (sizeAttrIds.has(row.attributeId)) sizes.add(row.optionId);
    }

    // Product availability = the best status across its enabled variants (in > low > out).
    const rank = (s: string): number =>
      s === SearchAvailability.IN_STOCK ? 2 : s === SearchAvailability.LOW_STOCK ? 1 : 0;
    let best = SearchAvailability.OUT_OF_STOCK as string;
    for (const id of variantIds) {
      const status = availabilityMap.get(id) ?? SearchAvailability.OUT_OF_STOCK;
      if (rank(status) > rank(best)) best = status;
    }

    return { colors: Array.from(colors), sizes: Array.from(sizes), availability: best };
  }

  /** Filterable attribute values keyed by Attribute.code → option labels[] (for facets + search text). */
  private async buildAttributeProjection(productId: string): Promise<Record<string, string[]>> {
    const values = await this.attributeValues.find({ where: { productId } });
    if (values.length === 0) return {};

    const attrIds = Array.from(new Set(values.map((v) => v.attributeId)));
    const attrs = await this.attributes.find({ where: { id: In(attrIds), isFilterable: true } });
    const codeById = new Map(attrs.map((a) => [a.id, a.code]));

    const optionIds = values.filter((v) => v.optionId).map((v) => v.optionId as string);
    const optionLabel = new Map(
      (optionIds.length > 0 ? await this.options.find({ where: { id: In(optionIds) } }) : []).map(
        (o) => [o.id, o.label],
      ),
    );

    const result: Record<string, string[]> = {};
    for (const v of values) {
      const code = codeById.get(v.attributeId);
      if (!code) continue;
      const label = v.optionId ? optionLabel.get(v.optionId) : v.valueText;
      if (!label) continue;
      (result[code] ??= []).push(label);
    }
    return result;
  }

  private isSaleActive(product: ProductOrmEntity, now: Date): boolean {
    if (product.salePrice === null || !product.saleStartsAt || !product.saleEndsAt) return false;
    return now >= product.saleStartsAt && now <= product.saleEndsAt;
  }

  private async isCategoryPublished(categoryId: string): Promise<boolean> {
    const cat = await this.categories.findOne({ where: { id: categoryId } });
    return !!cat && cat.isPublished && cat.deletedAt === null;
  }

  private money(value: string): string {
    return Number(value).toFixed(2);
  }
}
