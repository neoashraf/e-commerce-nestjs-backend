import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { AttributeType } from '../../domain/enums/attribute-type.enum';
import { ProductLinkType, ProductStatus } from '../../domain/enums/product-type.enum';
import { AttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductAttributeValueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductConfigurableAttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductLinkOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductVariantOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { AttributeFamilyOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import {
  INVENTORY_STATUS_PORT,
  IInventoryStatusPort,
} from '../ports/inventory-status.port';
import {
  PdpConfigurableAttributeDto,
  PdpImageDto,
  PdpLinkCardDto,
  PdpSpecDto,
  PdpVariantDto,
  PdpVideoDto,
  ProductDetailResponseDto,
} from '../../presentation/dto/product-detail.response';

const RELATED_FALLBACK_LIMIT = 8;

/** A single variant resolved for CART (cart read seam). */
export interface CartVariantView {
  variant_id: string;
  product_id: string;
  sku_code: string;
  title: string;
  options: Record<string, string>;
  image: string | null;
  /** Live effective unit price (Decimal 12,2, BR-CAT-6). */
  effective_unit_price: string;
  /** Whether the variant is currently buyable (enabled + published + not archived/deleted). */
  sellable: boolean;
}

/**
 * A product resolved for WISH (wishlist read seam). Card fields are live (BR-WISH-2); `available`
 * is false once the product is unpublished/archived/soft-deleted (rendered as "unavailable" but kept,
 * FR-WISH-012). `enabled_variant_ids` lets WISH derive product-level availability for items with no
 * preferred variant in one batched INV call (no N+1).
 */
export interface WishlistProductCard {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  primary_image: string | null;
  /** Live effective price (Decimal 12,2). */
  effective_price: string;
  base_price: string;
  on_sale: boolean;
  currency: 'BDT';
  /** Published + not archived/soft-deleted. */
  available: boolean;
  /** Enabled, non-deleted variant ids of this product. */
  enabled_variant_ids: string[];
}

/**
 * Storefront PDP read-model (FR-CAT-040..048): assembles `GET /products/{slug}` into the contract
 * payload — gallery (primary-first), configurable attributes (with swatches), enabled variants with
 * LIVE INV stock + effective price, specs (is_visible_on_front), and curated links (draft/archived/
 * deleted filtered, same-category fallback for empty related). Read-only; 404 for any non-published
 * slug. Money formatted to 2 dp; stock fetched in one batched INV call (no N+1).
 */
@Injectable()
export class ProductDetailService {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(AttributeFamilyOrmEntity)
    private readonly families: Repository<AttributeFamilyOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductVideoOrmEntity)
    private readonly videos: Repository<ProductVideoOrmEntity>,
    @InjectRepository(ProductVariantOrmEntity)
    private readonly variants: Repository<ProductVariantOrmEntity>,
    @InjectRepository(ProductVariantOptionOrmEntity)
    private readonly variantOptions: Repository<ProductVariantOptionOrmEntity>,
    @InjectRepository(ProductConfigurableAttributeOrmEntity)
    private readonly configurableAttributes: Repository<ProductConfigurableAttributeOrmEntity>,
    @InjectRepository(ProductAttributeValueOrmEntity)
    private readonly attributeValues: Repository<ProductAttributeValueOrmEntity>,
    @InjectRepository(ProductLinkOrmEntity)
    private readonly links: Repository<ProductLinkOrmEntity>,
    @InjectRepository(AttributeOrmEntity)
    private readonly attributes: Repository<AttributeOrmEntity>,
    @InjectRepository(AttributeOptionOrmEntity)
    private readonly options: Repository<AttributeOptionOrmEntity>,
    @Inject(INVENTORY_STATUS_PORT)
    private readonly inventoryStatus: IInventoryStatusPort,
  ) {}

  async getBySlug(slug: string, now: Date = new Date()): Promise<ProductDetailResponseDto> {
    const product = await this.products.findOne({ where: { slug } });
    if (!product || product.status !== ProductStatus.PUBLISHED || product.deletedAt !== null) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product "${slug}" not found.` });
    }

    const [family, breadcrumb, images, videos, variants] = await Promise.all([
      this.families.findOne({ where: { id: product.familyId } }),
      this.buildBreadcrumb(product.primaryCategoryId),
      this.buildImages(product.id),
      this.buildVideos(product.id),
      this.variants.find({ where: { productId: product.id, isEnabled: true } }),
    ]);

    const variantDtos = await this.buildVariants(product, variants, now);
    const configurable = await this.buildConfigurableAttributes(product.id);
    const specs = await this.buildSpecs(product.id);
    const links = await this.buildLinks(product, now);

    // Product-level price block reflects the representative (lowest effective-price) enabled variant.
    const representative = this.representativePrice(product, variants, now);

    return {
      id: product.id,
      type: product.type,
      family: family?.code ?? null,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      breadcrumb,
      short_description: product.shortDescription,
      description: product.description,
      effective_price: representative.effective,
      base_price: this.money(product.basePrice),
      currency: 'BDT',
      sale_active: representative.saleActive,
      is_new: product.isNew,
      is_featured: product.isFeatured,
      images,
      videos,
      configurable_attributes: configurable,
      variants: variantDtos,
      specs,
      links,
    };
  }

  // ---------------------------------------------------------------------------
  // Breadcrumb (primary-category path, root → leaf)
  // ---------------------------------------------------------------------------

  private async buildBreadcrumb(primaryCategoryId: string): Promise<string[]> {
    const names: string[] = [];
    let currentId: string | null = primaryCategoryId;
    const guard = new Set<string>();
    while (currentId && !guard.has(currentId)) {
      guard.add(currentId);
      const cat: CategoryOrmEntity | null = await this.categories.findOne({ where: { id: currentId } });
      if (!cat) break;
      names.unshift(cat.name);
      currentId = cat.parentId;
    }
    return names;
  }

  // ---------------------------------------------------------------------------
  // Gallery
  // ---------------------------------------------------------------------------

  private async buildImages(productId: string): Promise<PdpImageDto[]> {
    const rows = await this.images.find({ where: { productId } });
    return rows
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder)
      .map((img) => ({
        id: img.id,
        renditions: img.renditions ?? { detail: img.url, listing: img.url, thumb: img.url },
        alt_text: img.altText,
        color_option_id: img.colorOptionId,
        is_primary: img.isPrimary,
      }));
  }

  private async buildVideos(productId: string): Promise<PdpVideoDto[]> {
    const rows = await this.videos.find({ where: { productId }, order: { displayOrder: 'ASC' } });
    return rows.map((v) => ({ id: v.id, source: v.source, url: v.url }));
  }

  // ---------------------------------------------------------------------------
  // Configurable attributes (with swatches)
  // ---------------------------------------------------------------------------

  private async buildConfigurableAttributes(
    productId: string,
  ): Promise<PdpConfigurableAttributeDto[]> {
    const axes = await this.configurableAttributes.find({
      where: { productId },
      order: { position: 'ASC' },
    });
    if (axes.length === 0) return [];

    const attrIds = axes.map((a) => a.attributeId);
    const attrs = await this.attributes.find({ where: { id: In(attrIds) } });
    const attrById = new Map(attrs.map((a) => [a.id, a]));

    // Only the options actually used by this product's variants are offered.
    const usedOptionIds = await this.usedOptionIdsForProduct(productId);
    const optionRows = await this.options.find({ where: { attributeId: In(attrIds) } });

    return axes.map((axis) => {
      const attr = attrById.get(axis.attributeId);
      const opts = optionRows
        .filter((o) => o.attributeId === axis.attributeId && usedOptionIds.has(o.id))
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          id: o.id,
          value: o.label,
          swatch_type: o.swatchType,
          swatch_value: o.swatchValue,
        }));
      return { code: attr?.code ?? '', label: attr?.adminLabel ?? '', options: opts };
    });
  }

  private async usedOptionIdsForProduct(productId: string): Promise<Set<string>> {
    const variantIds = (
      await this.variants.find({ where: { productId, isEnabled: true }, select: { id: true } })
    ).map((v) => v.id);
    if (variantIds.length === 0) return new Set();
    const rows = await this.variantOptions.find({ where: { variantId: In(variantIds) } });
    return new Set(rows.map((r) => r.optionId));
  }

  /**
   * Cart read seam (consumed by CART via a port): resolve a single variant to the snapshot CART needs —
   * sellability (variant enabled + not soft-deleted, product published + not archived/soft-deleted),
   * the human-readable option values, a thumbnail, and the live effective unit price (BR-CAT-6). Returns
   * `null` when the variant doesn't exist; `sellable: false` when it exists but isn't currently buyable.
   */
  async getCartVariant(variantId: string, now: Date = new Date()): Promise<CartVariantView | null> {
    const variant = await this.variants.findOne({ where: { id: variantId } });
    if (!variant) return null;

    const product = await this.products.findOne({ where: { id: variant.productId } });
    if (!product) return null;

    const sellable =
      variant.isEnabled &&
      variant.deletedAt === null &&
      product.status === ProductStatus.PUBLISHED &&
      product.deletedAt === null;

    // Option values (e.g. { color: "Black", size: "42" }) keyed by attribute code.
    const optionRows = await this.variantOptions.find({ where: { variantId } });
    const attrCodeById = new Map(
      (
        await this.attributes.find({
          where: { id: In(optionRows.map((o) => o.attributeId)) },
        })
      ).map((a) => [a.id, a.code]),
    );
    const optionValueById = new Map(
      (
        await this.options.find({ where: { id: In(optionRows.map((o) => o.optionId)) } })
      ).map((o) => [o.id, o.value]),
    );
    const options: Record<string, string> = {};
    for (const row of optionRows) {
      const code = attrCodeById.get(row.attributeId);
      const value = optionValueById.get(row.optionId);
      if (code && value) options[code] = value;
    }

    // Thumbnail: the variant's image if set, else the product's primary image.
    let image: string | null = null;
    if (variant.imageId) {
      const img = await this.images.findOne({ where: { id: variant.imageId } });
      image = img?.url ?? null;
    }
    if (!image) {
      const primary = await this.images.findOne({
        where: { productId: product.id, isPrimary: true },
      });
      image = primary?.url ?? null;
    }

    return {
      variant_id: variant.id,
      product_id: product.id,
      sku_code: variant.skuCode,
      title: product.name,
      options,
      image,
      effective_unit_price: this.effectivePriceForVariant(product, variant, now),
      sellable,
    };
  }

  /**
   * Wishlist read seam (consumed by WISH via a port): batch-resolve product cards for a set of saved
   * product ids (BR-WISH-2, FR-WISH-010/012). Includes archived/soft-deleted products (`available:false`)
   * so the wishlist can keep + flag them as unavailable. Returns a map keyed by product id; ids with no
   * product row are simply absent. Live price/on-sale; `enabled_variant_ids` for product-level stock.
   */
  async getWishlistProductCards(
    productIds: string[],
    now: Date = new Date(),
  ): Promise<Map<string, WishlistProductCard>> {
    const result = new Map<string, WishlistProductCard>();
    const unique = Array.from(new Set(productIds));
    if (unique.length === 0) return result;

    // withDeleted: include soft-deleted/archived so WISH can render them as "unavailable" (FR-WISH-012).
    const products = await this.products.find({ where: { id: In(unique) }, withDeleted: true });
    if (products.length === 0) return result;

    const ids = products.map((p) => p.id);
    const [primaryImages, enabledVariants] = await Promise.all([
      this.images.find({ where: { productId: In(ids), isPrimary: true } }),
      this.variants.find({
        where: { productId: In(ids), isEnabled: true },
        select: { id: true, productId: true },
      }),
    ]);

    const imageByProduct = new Map<string, string>();
    for (const img of primaryImages) {
      if (!imageByProduct.has(img.productId)) imageByProduct.set(img.productId, img.url);
    }
    const variantsByProduct = new Map<string, string[]>();
    for (const v of enabledVariants) {
      const list = variantsByProduct.get(v.productId) ?? [];
      list.push(v.id);
      variantsByProduct.set(v.productId, list);
    }

    for (const product of products) {
      const available =
        product.status === ProductStatus.PUBLISHED && product.deletedAt === null;
      result.set(product.id, {
        id: product.id,
        slug: product.slug,
        title: product.name,
        brand: product.brand,
        primary_image: imageByProduct.get(product.id) ?? null,
        effective_price: this.effectiveProductPrice(product, now),
        base_price: this.money(product.basePrice),
        on_sale: this.isSaleActive(product, now),
        currency: 'BDT',
        available,
        enabled_variant_ids: variantsByProduct.get(product.id) ?? [],
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Variants (options map, effective price, live stock)
  // ---------------------------------------------------------------------------

  private async buildVariants(
    product: ProductOrmEntity,
    variants: ProductVariantOrmEntity[],
    now: Date,
  ): Promise<PdpVariantDto[]> {
    if (variants.length === 0) return [];

    const variantIds = variants.map((v) => v.id);
    const [optionRows, stockMap, axisAttrs] = await Promise.all([
      this.variantOptions.find({ where: { variantId: In(variantIds) } }),
      this.inventoryStatus.getStatusByVariantIds(variantIds),
      this.configurableAttributes.find({ where: { productId: product.id } }),
    ]);

    const attrCodeById = new Map(
      (await this.attributes.find({ where: { id: In(axisAttrs.map((a) => a.attributeId)) } })).map(
        (a) => [a.id, a.code],
      ),
    );

    const optionsByVariant = new Map<string, Record<string, string>>();
    for (const row of optionRows) {
      const map = optionsByVariant.get(row.variantId) ?? {};
      const code = attrCodeById.get(row.attributeId);
      if (code) map[code] = row.optionId;
      optionsByVariant.set(row.variantId, map);
    }

    return variants.map((v) => ({
      id: v.id,
      sku_code: v.skuCode,
      options: optionsByVariant.get(v.id) ?? {},
      price: this.effectivePriceForVariant(product, v, now),
      stock_status: stockMap.get(v.id)?.status ?? 'out_of_stock',
    }));
  }

  // ---------------------------------------------------------------------------
  // Specs (is_visible_on_front)
  // ---------------------------------------------------------------------------

  private async buildSpecs(productId: string): Promise<PdpSpecDto[]> {
    const values = await this.attributeValues.find({ where: { productId } });
    if (values.length === 0) return [];

    const attrIds = Array.from(new Set(values.map((v) => v.attributeId)));
    const attrs = await this.attributes.find({ where: { id: In(attrIds) } });
    const visibleById = new Map(
      attrs.filter((a) => a.isVisibleOnFront).map((a) => [a.id, a]),
    );

    const optionIds = values.filter((v) => v.optionId).map((v) => v.optionId as string);
    const optionLabel = new Map(
      (optionIds.length > 0 ? await this.options.find({ where: { id: In(optionIds) } }) : []).map(
        (o) => [o.id, o.label],
      ),
    );

    // Group multiselect values (one row per option) into arrays of labels.
    const grouped = new Map<string, { label: string; code: string; values: string[] }>();
    for (const v of values) {
      const attr = visibleById.get(v.attributeId);
      if (!attr) continue;
      const entry = grouped.get(attr.id) ?? { label: attr.adminLabel, code: attr.code, values: [] };
      entry.values.push(this.renderValue(attr.type, v, optionLabel));
      grouped.set(attr.id, entry);
    }

    return Array.from(grouped.values()).map((g) => ({
      code: g.code,
      label: g.label,
      value: g.values.length > 1 ? g.values : g.values[0],
    }));
  }

  private renderValue(
    type: string,
    v: ProductAttributeValueOrmEntity,
    optionLabel: Map<string, string>,
  ): string {
    if (v.optionId) return optionLabel.get(v.optionId) ?? v.optionId;
    if (type === AttributeType.BOOLEAN) return v.valueBoolean ? 'Yes' : 'No';
    if (v.valueDecimal !== null && v.valueDecimal !== undefined) return String(v.valueDecimal);
    if (v.valueDatetime) return v.valueDatetime.toISOString();
    return v.valueText ?? '';
  }

  // ---------------------------------------------------------------------------
  // Links (curated + fallback)
  // ---------------------------------------------------------------------------

  private async buildLinks(
    product: ProductOrmEntity,
    now: Date,
  ): Promise<{ related: PdpLinkCardDto[]; up_sell: PdpLinkCardDto[]; cross_sell: PdpLinkCardDto[] }> {
    const linkRows = await this.links.find({
      where: { productId: product.id },
      order: { position: 'ASC' },
    });

    const byType = (type: ProductLinkType): string[] =>
      linkRows.filter((l) => l.type === type).map((l) => l.linkedProductId);

    const related = await this.cardsFor(byType(ProductLinkType.RELATED), now);
    const upSell = await this.cardsFor(byType(ProductLinkType.UP_SELL), now);
    const crossSell = await this.cardsFor(byType(ProductLinkType.CROSS_SELL), now);

    const relatedFinal =
      related.length > 0
        ? related
        : await this.sameCategoryFallback(product, now);

    return { related: relatedFinal, up_sell: upSell, cross_sell: crossSell };
  }

  /** Build link cards, filtering out non-published / soft-deleted targets (FR-CAT-019/045). */
  private async cardsFor(ids: string[], now: Date): Promise<PdpLinkCardDto[]> {
    if (ids.length === 0) return [];
    const rows = await this.products.find({
      where: { id: In(ids), status: ProductStatus.PUBLISHED, deletedAt: IsNull() },
    });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    const sorted = rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return Promise.all(sorted.map((p) => this.toCard(p, now)));
  }

  /** Empty-related fallback: up to 8 same-(primary-)category published products (FR-CAT-045). */
  private async sameCategoryFallback(product: ProductOrmEntity, now: Date): Promise<PdpLinkCardDto[]> {
    const rows = await this.products.find({
      where: {
        primaryCategoryId: product.primaryCategoryId,
        status: ProductStatus.PUBLISHED,
        deletedAt: IsNull(),
      },
      take: RELATED_FALLBACK_LIMIT + 1,
    });
    const others = rows.filter((p) => p.id !== product.id).slice(0, RELATED_FALLBACK_LIMIT);
    return Promise.all(others.map((p) => this.toCard(p, now)));
  }

  private async toCard(p: ProductOrmEntity, now: Date): Promise<PdpLinkCardDto> {
    const primaryImage = p.primaryImageId
      ? await this.images.findOne({ where: { id: p.primaryImageId } })
      : null;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      primary_image: primaryImage?.url ?? null,
      effective_price: this.effectiveProductPrice(p, now),
    };
  }

  // ---------------------------------------------------------------------------
  // Pricing
  // ---------------------------------------------------------------------------

  private representativePrice(
    product: ProductOrmEntity,
    variants: ProductVariantOrmEntity[],
    now: Date,
  ): { effective: string; saleActive: boolean } {
    const saleActive = this.isSaleActive(product, now);
    if (variants.length === 0) {
      return { effective: this.effectiveProductPrice(product, now), saleActive };
    }
    const prices = variants.map((v) => Number(this.effectivePriceForVariant(product, v, now)));
    const lowest = Math.min(...prices);
    return { effective: this.money(String(lowest)), saleActive };
  }

  /** Variant effective price: sale_price (in-window) over the variant's base (override else product base). */
  private effectivePriceForVariant(
    product: ProductOrmEntity,
    variant: ProductVariantOrmEntity,
    now: Date,
  ): string {
    const base = variant.priceOverride ?? product.basePrice;
    if (this.isSaleActive(product, now) && product.salePrice !== null) {
      // Sale applies to the product; a variant override replaces only the base, not the sale price.
      return this.money(product.salePrice);
    }
    return this.money(base);
  }

  private effectiveProductPrice(product: ProductOrmEntity, now: Date): string {
    if (this.isSaleActive(product, now) && product.salePrice !== null) {
      return this.money(product.salePrice);
    }
    return this.money(product.basePrice);
  }

  private isSaleActive(product: ProductOrmEntity, now: Date): boolean {
    if (product.salePrice === null || !product.saleStartsAt || !product.saleEndsAt) return false;
    return now >= product.saleStartsAt && now <= product.saleEndsAt;
  }

  private money(value: string): string {
    return Number(value).toFixed(2);
  }
}
