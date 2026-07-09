import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import { Attribute } from '../../domain/entities/attribute.entity';
import { AttributeType } from '../../domain/enums/attribute-type.enum';
import {
  ProductLinkType,
  ProductStatus,
  ProductType,
} from '../../domain/enums/product-type.enum';
import { AttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { AttributeFamilyOrmEntity } from '../../infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import { CategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductAttributeValueOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductCategoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-category.orm-entity';
import { ProductConfigurableAttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductLinkOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { ProductVideoOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductVariantOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { AttributeAssignmentValidator } from './attribute-assignment.validator';
import {
  INVENTORY_QTY_PORT,
  IInventoryQtyPort,
} from '../ports/inventory-qty.port';
import {
  INVENTORY_ADMIN_PORT,
  IInventoryAdminPort,
} from '../ports/inventory-admin.port';
import {
  PRODUCT_VARIANT_PUBLISH_PORT,
  IProductVariantPublishPort,
} from '../ports/product-variant-publish.port';
import { SEARCH_INDEX_PORT, ISearchIndexPort } from '../ports/search-index.port';
import { ProductPublishValidator } from './product-publish.validator';
import { ProductSupportService } from './product-support.service';

export interface CreateProductInput {
  type: ProductType;
  familyId: string;
  sku: string;
  name: string;
  primaryCategoryId: string;
  categoryIds?: string[];
  brand?: string;
  shortDescription?: string;
  description?: string;
  basePrice: string;
  salePrice?: string;
  saleStartsAt?: string;
  saleEndsAt?: string;
  isFeatured?: boolean;
  isNew?: boolean;
  weight?: string;
  attributes?: Record<string, unknown>;
  metaTitle?: string;
  metaKeywords?: string;
  metaDescription?: string;
}

export interface UpdateProductInput {
  id: string;
  updatedAt: string;
  name?: string;
  primaryCategoryId?: string;
  categoryIds?: string[];
  brand?: string;
  shortDescription?: string;
  description?: string;
  basePrice?: string;
  salePrice?: string | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  isFeatured?: boolean;
  isNew?: boolean;
  weight?: string;
  attributes?: Record<string, unknown>;
  metaTitle?: string;
  metaKeywords?: string;
  metaDescription?: string;
}

export interface AdminProductRow {
  id: string;
  name: string;
  sku: string;
  type: string;
  family: string | null;
  primary_image: string | null;
  base_price: string;
  sale_price: string | null;
  sale_active: boolean;
  status: string;
  primary_category: string | null;
  qty: number | null;
  qty_status: string | null;
}

/** Raw row shape returned by the admin-list query before the INV/sale enrichment. */
interface AdminProductRawRow {
  id: string;
  name: string;
  sku: string;
  type: string;
  family: string | null;
  primary_image: string | null;
  base_price: string;
  sale_price: string | null;
  sale_starts_at: string | Date | null;
  sale_ends_at: string | Date | null;
  status: string;
  primary_category: string | null;
}

/** Filters shared by the admin product list + CSV export. */
export interface AdminProductListFilter {
  status?: ProductStatus;
  type?: ProductType;
  family?: string;
  category?: string;
  q?: string;
}

/** Outcome of a single product in a bulk status transition (FR-CAT-015/016). */
export interface BulkStatusResultItem {
  id: string;
  ok: boolean;
  status?: string;
  code?: string;
  details?: string[];
}

/** Full product detail for the admin editor (all editable fields + `updated_at` for optimistic writes). */
/** One variant row in the admin editor's variant matrix, with live INV stock (FR-CAT-020/021). */
export interface AdminProductVariant {
  id: string;
  sku_code: string;
  options: Record<string, string>;
  price: string | null;
  image_id: string | null;
  is_enabled: boolean;
  on_hand: number;
  low_stock_threshold: number;
}

/** One image in the admin editor gallery (FR-CAT-030/032). */
export interface AdminProductImage {
  id: string;
  url: string;
  renditions: Record<string, string>;
  alt_text: string;
  color_option_id: string | null;
  is_primary: boolean;
  display_order: number;
}

/** One video in the admin editor (FR-CAT-034), ordered after images. */
export interface AdminProductVideo {
  id: string;
  source: string;
  url: string;
  display_order: number;
}

/** One option of a configurable axis, for the editor's image colour-tag dropdown + swatch (FR-CAT-032). */
export interface AdminConfigurableOption {
  id: string;
  value: string;
  swatch_type: string | null;
  swatch_value: string | null;
}

/** A product configurable axis (e.g. `color`) with all its options — the colour-tag source (FR-CAT-032). */
export interface AdminConfigurableAttribute {
  code: string;
  label: string;
  options: AdminConfigurableOption[];
}

/** A linked product summary shown as a chip in the editor's Links section (FR-CAT-019). */
export interface AdminProductLink {
  id: string;
  name: string;
  sku: string;
  primary_image: string | null;
}

/** The product's typed links for the editor — each group preserves its saved order (FR-CAT-019). */
export interface AdminProductLinks {
  related: AdminProductLink[];
  up_sell: AdminProductLink[];
  cross_sell: AdminProductLink[];
}

export interface AdminProductDetail {
  id: string;
  type: string;
  family_id: string;
  family_code: string | null;
  sku: string;
  name: string;
  slug: string;
  status: string;
  brand: string | null;
  short_description: string | null;
  description: string | null;
  base_price: string;
  sale_price: string | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  is_featured: boolean;
  is_new: boolean;
  weight: string | null;
  primary_category_id: string;
  category_ids: string[];
  primary_image_id: string | null;
  images: AdminProductImage[];
  videos: AdminProductVideo[];
  configurable_attributes: AdminConfigurableAttribute[];
  links: AdminProductLinks;
  variants: AdminProductVariant[];
  meta_title: string | null;
  meta_keywords: string | null;
  meta_description: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Catalog product write model (FR-CAT-010–019): create (with EAV value assignment + unique slug),
 * update (family immutable, optimistic concurrency), typed links, lifecycle (publish trinity /
 * archive), soft-delete order guard, and the admin list with a live INV `qty` join. Stock is never
 * stored here. Variant generation lives in the variants slice; this owns the simple-product implicit
 * SKU and the publish-validation seam.
 */
@Injectable()
export class ProductsService {
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
    @InjectRepository(ProductLinkOrmEntity)
    private readonly links: Repository<ProductLinkOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly support: ProductSupportService,
    private readonly assignmentValidator: AttributeAssignmentValidator,
    private readonly publishValidator: ProductPublishValidator,
    @Inject(INVENTORY_QTY_PORT)
    private readonly inventoryQty: IInventoryQtyPort,
    @Inject(PRODUCT_VARIANT_PUBLISH_PORT)
    private readonly variantPublish: IProductVariantPublishPort,
    @Inject(SEARCH_INDEX_PORT)
    private readonly searchIndex: ISearchIndexPort,
    @Inject(INVENTORY_ADMIN_PORT)
    private readonly inventoryAdmin: IInventoryAdminPort,
  ) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async create(input: CreateProductInput): Promise<{ id: string; slug: string; type: string; status: string }> {
    const family = await this.families.findOne({ where: { id: input.familyId } });
    if (!family) {
      throw new NotFoundException({
        code: 'FAMILY_NOT_FOUND',
        message: `Attribute family ${input.familyId} not found.`,
      });
    }
    const primaryCategory = await this.categories.findOne({ where: { id: input.primaryCategoryId } });
    if (!primaryCategory) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Primary category ${input.primaryCategoryId} not found.`,
      });
    }
    if (await this.support.skuExists(input.sku)) {
      throw new ConflictException({
        code: 'SKU_CONFLICT',
        message: `SKU "${input.sku}" already exists.`,
      });
    }

    this.validateSaleWindow(input.basePrice, input.salePrice, input.saleStartsAt, input.saleEndsAt);
    await this.assertAdditionalCategoriesExist(input.categoryIds ?? []);

    const familyAttributes = await this.support.getFamilyAttributes(input.familyId);
    const resolvedValues = await this.resolveAttributeValues(familyAttributes, input.attributes ?? {});

    const slug = await this.support.generateUniqueSlug(input.name);

    const { id, implicitVariantId } = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductOrmEntity);
      const saved = await repo.save(
        repo.create({
          type: input.type,
          familyId: input.familyId,
          sku: input.sku,
          name: input.name,
          slug,
          brand: input.brand ?? null,
          shortDescription: input.shortDescription ?? null,
          description: input.description ?? null,
          basePrice: input.basePrice,
          salePrice: input.salePrice ?? null,
          saleStartsAt: input.saleStartsAt ? new Date(input.saleStartsAt) : null,
          saleEndsAt: input.saleEndsAt ? new Date(input.saleEndsAt) : null,
          status: ProductStatus.DRAFT,
          isFeatured: input.isFeatured ?? false,
          isNew: input.isNew ?? false,
          weight: input.weight ?? null,
          primaryCategoryId: input.primaryCategoryId,
          primaryImageId: null,
          metaTitle: input.metaTitle ?? null,
          metaKeywords: input.metaKeywords ?? null,
          metaDescription: input.metaDescription ?? null,
        }),
      );
      await this.persistAttributeValues(manager, saved.id, resolvedValues);
      await this.replaceAdditionalCategories(manager, saved.id, input.categoryIds ?? []);

      // FR-CAT-025: a simple product IS a single implicit variant carrying the product SKU. Create
      // that variant now (no option rows — simple has no axes) so the product is a real, sellable
      // SKU; configurable products defer variant generation to the variants slice.
      let implicitVariantId: string | null = null;
      if (input.type === ProductType.SIMPLE) {
        const variant = await manager.getRepository(ProductVariantOrmEntity).save(
          manager.getRepository(ProductVariantOrmEntity).create({
            productId: saved.id,
            skuCode: input.sku,
            priceOverride: null,
            imageId: null,
            isEnabled: true,
          }),
        );
        implicitVariantId = variant.id;
      }
      return { id: saved.id, implicitVariantId };
    });

    // FR-INV-002: the implicit variant gets a zero-stock inventory record so the product is
    // immediately stock-manageable + visible on the inventory page. After commit; INV degrades
    // gracefully (mirrors variants.service for configurable variants).
    if (implicitVariantId) {
      await this.inventoryAdmin.ensureRecordForVariant(implicitVariantId, id);
    }

    return { id, slug, type: input.type, status: ProductStatus.DRAFT };
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Admin detail (editor prefill)
  // ---------------------------------------------------------------------------

  /** Full product detail for the admin editor: scalars + additional categories + EAV values + updated_at. */
  async getAdminDetail(id: string): Promise<AdminProductDetail> {
    const p = await this.products.findOne({ where: { id } });
    if (!p) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${id} not found.` });
    }
    const family = await this.families.findOne({ where: { id: p.familyId } });
    const categoryLinks = await this.dataSource
      .getRepository(ProductCategoryOrmEntity)
      .find({ where: { productId: id } });
    const attributes = await this.loadProductAttributes(id);

    // Gallery for the editor (primary first, then display order) — lets the UI show + preview images.
    const imageRows = await this.images.find({ where: { productId: id } });
    const images: AdminProductImage[] = imageRows
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.displayOrder - b.displayOrder)
      .map((img) => ({
        id: img.id,
        url: img.url,
        renditions: img.renditions ?? { detail: img.url, listing: img.url, thumb: img.url },
        alt_text: img.altText,
        color_option_id: img.colorOptionId,
        is_primary: img.isPrimary,
        display_order: img.displayOrder,
      }));

    // Videos for the editor, ordered after the gallery (FR-CAT-034).
    const videoRows = await this.videos.find({
      where: { productId: id },
      order: { displayOrder: 'ASC', createdAt: 'ASC' },
    });
    const videos: AdminProductVideo[] = videoRows.map((v) => ({
      id: v.id,
      source: v.source,
      url: v.url,
      display_order: v.displayOrder,
    }));

    const variants = await this.loadProductVariants(id);
    const configurableAttributes = await this.buildAdminConfigurableAttributes(id);
    const links = await this.buildAdminLinks(id);

    return {
      id: p.id,
      type: p.type,
      family_id: p.familyId,
      family_code: family?.code ?? null,
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      status: p.status,
      brand: p.brand,
      short_description: p.shortDescription,
      description: p.description,
      base_price: p.basePrice,
      sale_price: p.salePrice,
      sale_starts_at: p.saleStartsAt?.toISOString() ?? null,
      sale_ends_at: p.saleEndsAt?.toISOString() ?? null,
      is_featured: p.isFeatured,
      is_new: p.isNew,
      weight: p.weight,
      primary_category_id: p.primaryCategoryId,
      category_ids: categoryLinks.map((c) => c.categoryId),
      primary_image_id: p.primaryImageId,
      images,
      videos,
      configurable_attributes: configurableAttributes,
      links,
      variants,
      meta_title: p.metaTitle,
      meta_keywords: p.metaKeywords,
      meta_description: p.metaDescription,
      attributes,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
    };
  }

  /**
   * Load a product's variants for the editor matrix: options as `{ code: label }`, the price override,
   * enabled flag, and live on-hand stock + threshold joined from INV (per-variant). Soft-deleted
   * variants are excluded. Empty for simple products.
   */
  private async loadProductVariants(productId: string): Promise<AdminProductVariant[]> {
    const variants = await this.dataSource
      .getRepository(ProductVariantOrmEntity)
      .find({ where: { productId }, order: { createdAt: 'ASC' } });
    if (variants.length === 0) return [];

    const variantIds = variants.map((v) => v.id);
    const optionRows = await this.dataSource
      .getRepository(ProductVariantOptionOrmEntity)
      .find({ where: { variantId: In(variantIds) } });

    const attrIds = Array.from(new Set(optionRows.map((o) => o.attributeId)));
    const optIds = Array.from(new Set(optionRows.map((o) => o.optionId)));
    const attrCodeById = new Map(
      (attrIds.length
        ? await this.dataSource.getRepository(AttributeOrmEntity).find({ where: { id: In(attrIds) } })
        : []
      ).map((a) => [a.id, a.code]),
    );
    const optLabelById = new Map(
      (optIds.length
        ? await this.dataSource
            .getRepository(AttributeOptionOrmEntity)
            .find({ where: { id: In(optIds) } })
        : []
      ).map((o) => [o.id, o.label]),
    );

    const optionsByVariant = new Map<string, Record<string, string>>();
    for (const row of optionRows) {
      const map = optionsByVariant.get(row.variantId) ?? {};
      const code = attrCodeById.get(row.attributeId);
      const label = optLabelById.get(row.optionId);
      if (code && label) map[code] = label;
      optionsByVariant.set(row.variantId, map);
    }

    // Live stock per variant (INV is the single source of truth; absent ids default to 0).
    const levels = await this.inventoryAdmin.getLevelsByVariantIds(variantIds);

    return variants.map((v) => ({
      id: v.id,
      sku_code: v.skuCode,
      options: optionsByVariant.get(v.id) ?? {},
      price: v.priceOverride,
      image_id: v.imageId,
      is_enabled: v.isEnabled,
      on_hand: levels.get(v.id)?.on_hand ?? 0,
      low_stock_threshold: levels.get(v.id)?.low_stock_threshold ?? 0,
    }));
  }

  /**
   * Build the product's configurable attribute groups (e.g. `color`, `size`) with **all** their options
   * for the editor — the source for the per-image colour-tag dropdown + swatch (FR-CAT-032). Mirrors the
   * storefront PDP `configurable_attributes` shape, but returns every option of each axis (not just the
   * variant-used ones) so an image can be tagged with any colour the product's family offers — exactly
   * the set `ProductMediaService.updateImage` validates a `color_option_id` against. Empty for a simple
   * product (no configurable axes). Ordered by axis position, options by their own position.
   */
  private async buildAdminConfigurableAttributes(
    productId: string,
  ): Promise<AdminConfigurableAttribute[]> {
    const axes = await this.dataSource
      .getRepository(ProductConfigurableAttributeOrmEntity)
      .find({ where: { productId }, order: { position: 'ASC' } });
    if (axes.length === 0) return [];

    const attrIds = Array.from(new Set(axes.map((a) => a.attributeId)));
    const [attrs, optionRows] = await Promise.all([
      this.dataSource.getRepository(AttributeOrmEntity).find({ where: { id: In(attrIds) } }),
      this.dataSource.getRepository(AttributeOptionOrmEntity).find({ where: { attributeId: In(attrIds) } }),
    ]);
    const attrById = new Map(attrs.map((a) => [a.id, a]));

    return axes.map((axis) => {
      const attr = attrById.get(axis.attributeId);
      const options = optionRows
        .filter((o) => o.attributeId === axis.attributeId)
        .sort((a, b) => a.position - b.position)
        .map((o) => ({
          id: o.id,
          value: o.label,
          swatch_type: o.swatchType,
          swatch_value: o.swatchValue,
        }));
      return { code: attr?.code ?? '', label: attr?.adminLabel ?? '', options };
    });
  }

  /**
   * Build the product's typed links (related / up-sell / cross-sell) with linked-product summaries for
   * the editor's Links section (FR-CAT-019) — so reopening the editor shows the saved links instead of
   * blank groups. Each group preserves the saved order; soft-deleted linked products are skipped.
   */
  private async buildAdminLinks(productId: string): Promise<AdminProductLinks> {
    const empty: AdminProductLinks = { related: [], up_sell: [], cross_sell: [] };
    const linkRows = await this.links.find({ where: { productId }, order: { position: 'ASC' } });
    if (linkRows.length === 0) return empty;

    const linkedIds = Array.from(new Set(linkRows.map((l) => l.linkedProductId)));
    const linked = await this.products.find({ where: { id: In(linkedIds) } });
    const imageIds = linked.map((p) => p.primaryImageId).filter((id): id is string => !!id);
    const imageById = new Map(
      (imageIds.length ? await this.images.find({ where: { id: In(imageIds) } }) : []).map((img) => [
        img.id,
        img,
      ]),
    );
    const summaryById = new Map<string, AdminProductLink>(
      linked.map((p) => {
        const img = p.primaryImageId ? imageById.get(p.primaryImageId) : undefined;
        return [
          p.id,
          { id: p.id, name: p.name, sku: p.sku, primary_image: img ? img.renditions?.thumb ?? img.url : null },
        ];
      }),
    );

    const group = (type: ProductLinkType): AdminProductLink[] =>
      linkRows
        .filter((l) => l.type === type)
        .map((l) => summaryById.get(l.linkedProductId))
        .filter((x): x is AdminProductLink => !!x);

    return {
      related: group(ProductLinkType.RELATED),
      up_sell: group(ProductLinkType.UP_SELL),
      cross_sell: group(ProductLinkType.CROSS_SELL),
    };
  }

  /** Resolve a product's stored EAV rows to an editor-friendly `{ code: value | value[] }` map. */
  private async loadProductAttributes(productId: string): Promise<Record<string, unknown>> {
    const values = await this.dataSource
      .getRepository(ProductAttributeValueOrmEntity)
      .find({ where: { productId } });
    if (values.length === 0) return {};

    const attrIds = Array.from(new Set(values.map((v) => v.attributeId)));
    const attrs = await this.dataSource
      .getRepository(AttributeOrmEntity)
      .find({ where: { id: In(attrIds) } });
    const codeById = new Map(attrs.map((a) => [a.id, a.code]));
    const typeById = new Map(attrs.map((a) => [a.id, a.type]));

    const optionIds = values.filter((v) => v.optionId).map((v) => v.optionId as string);
    const optionValueById = new Map(
      (optionIds.length > 0
        ? await this.dataSource
            .getRepository(AttributeOptionOrmEntity)
            .find({ where: { id: In(optionIds) } })
        : []
      ).map((o) => [o.id, o.value]),
    );

    const out: Record<string, unknown> = {};
    for (const v of values) {
      const code = codeById.get(v.attributeId);
      if (!code) continue;
      const value = v.optionId
        ? optionValueById.get(v.optionId) ?? v.optionId
        : v.valueBoolean !== null && v.valueBoolean !== undefined
          ? v.valueBoolean
          : v.valueDecimal !== null && v.valueDecimal !== undefined
            ? Number(v.valueDecimal)
            : v.valueDatetime
              ? v.valueDatetime.toISOString()
              : v.valueText ?? null;
      // multiselect persists one row per option → always an array (even single value) so the editor
      // round-trips it back as an array; the assignment validator rejects a scalar for multiselect.
      if (typeById.get(v.attributeId) === AttributeType.MULTISELECT) {
        out[code] = Array.isArray(out[code]) ? [...(out[code] as unknown[]), value] : [value];
      } else if (out[code] === undefined) {
        out[code] = value;
      } else {
        out[code] = Array.isArray(out[code]) ? [...(out[code] as unknown[]), value] : [out[code], value];
      }
    }
    return out;
  }

  async update(input: UpdateProductInput): Promise<{ id: string }> {
    const product = await this.products.findOne({ where: { id: input.id } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${input.id} not found.` });
    }

    // Optimistic concurrency on updated_at (§12.5).
    if (new Date(input.updatedAt).getTime() !== product.updatedAt.getTime()) {
      throw new ConflictException({
        code: 'STALE_WRITE',
        message: 'Product was modified by another write. Reload and retry.',
      });
    }

    if (input.primaryCategoryId !== undefined) {
      const exists = await this.categories.findOne({ where: { id: input.primaryCategoryId } });
      if (!exists) {
        throw new NotFoundException({
          code: 'CATEGORY_NOT_FOUND',
          message: `Primary category ${input.primaryCategoryId} not found.`,
        });
      }
    }
    await this.assertAdditionalCategoriesExist(input.categoryIds ?? []);

    const nextBase = input.basePrice ?? product.basePrice;
    const nextSale = input.salePrice !== undefined ? input.salePrice : product.salePrice;
    const nextStart =
      input.saleStartsAt !== undefined
        ? input.saleStartsAt
        : product.saleStartsAt?.toISOString() ?? null;
    const nextEnd =
      input.saleEndsAt !== undefined ? input.saleEndsAt : product.saleEndsAt?.toISOString() ?? null;
    this.validateSaleWindow(nextBase, nextSale, nextStart, nextEnd);

    let resolvedValues: ResolvedAttributeValue[] | null = null;
    if (input.attributes !== undefined) {
      const familyAttributes = await this.support.getFamilyAttributes(product.familyId);
      resolvedValues = await this.resolveAttributeValues(familyAttributes, input.attributes);
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductOrmEntity);
      const patch: Partial<ProductOrmEntity> = {};
      if (input.name !== undefined) {
        patch.name = input.name;
        patch.slug = await this.support.generateUniqueSlug(input.name, product.id);
      }
      if (input.primaryCategoryId !== undefined) patch.primaryCategoryId = input.primaryCategoryId;
      if (input.brand !== undefined) patch.brand = input.brand;
      if (input.shortDescription !== undefined) patch.shortDescription = input.shortDescription;
      if (input.description !== undefined) patch.description = input.description;
      if (input.basePrice !== undefined) patch.basePrice = input.basePrice;
      if (input.salePrice !== undefined) patch.salePrice = input.salePrice;
      if (input.saleStartsAt !== undefined) {
        patch.saleStartsAt = input.saleStartsAt ? new Date(input.saleStartsAt) : null;
      }
      if (input.saleEndsAt !== undefined) {
        patch.saleEndsAt = input.saleEndsAt ? new Date(input.saleEndsAt) : null;
      }
      if (input.isFeatured !== undefined) patch.isFeatured = input.isFeatured;
      if (input.isNew !== undefined) patch.isNew = input.isNew;
      if (input.weight !== undefined) patch.weight = input.weight;
      if (input.metaTitle !== undefined) patch.metaTitle = input.metaTitle;
      if (input.metaKeywords !== undefined) patch.metaKeywords = input.metaKeywords;
      if (input.metaDescription !== undefined) patch.metaDescription = input.metaDescription;

      if (Object.keys(patch).length > 0) {
        await repo.update({ id: product.id }, patch);
      }
      if (resolvedValues !== null) {
        await manager.getRepository(ProductAttributeValueOrmEntity).delete({ productId: product.id });
        await this.persistAttributeValues(manager, product.id, resolvedValues);
      }
      if (input.categoryIds !== undefined) {
        await this.replaceAdditionalCategories(manager, product.id, input.categoryIds);
      }
    });

    // Keep the storefront index in sync with edits to a published product (graceful; no-op for drafts).
    await this.searchIndex.upsert(product.id);
    return { id: product.id };
  }

  // ---------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------

  async setLinks(
    productId: string,
    related: string[],
    upSell: string[],
    crossSell: string[],
  ): Promise<{ related: number; up_sell: number; cross_sell: number }> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${productId} not found.` });
    }

    const dedupe = (ids: string[]): string[] => Array.from(new Set(ids.filter((id) => id !== productId)));
    const byType: Record<ProductLinkType, string[]> = {
      [ProductLinkType.RELATED]: dedupe(related),
      [ProductLinkType.UP_SELL]: dedupe(upSell),
      [ProductLinkType.CROSS_SELL]: dedupe(crossSell),
    };

    const allTargets = Array.from(new Set([...byType.related, ...byType.up_sell, ...byType.cross_sell]));
    if (allTargets.length > 0) {
      const found = await this.products.find({ where: { id: In(allTargets) }, select: { id: true } });
      const foundIds = new Set(found.map((p) => p.id));
      const unknown = allTargets.filter((id) => !foundIds.has(id));
      if (unknown.length > 0) {
        throw new BadRequestException({
          code: 'UNKNOWN_LINK_TARGET',
          message: `Unknown product link targets: ${unknown.join(', ')}.`,
        });
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ProductLinkOrmEntity);
      await repo.delete({ productId });
      const rows: Partial<ProductLinkOrmEntity>[] = [];
      for (const type of Object.values(ProductLinkType)) {
        byType[type].forEach((linkedProductId, idx) => {
          rows.push({ productId, linkedProductId, type, position: idx + 1 });
        });
      }
      if (rows.length > 0) await repo.insert(rows);
    });

    return {
      related: byType.related.length,
      up_sell: byType.up_sell.length,
      cross_sell: byType.cross_sell.length,
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async setStatus(productId: string, status: ProductStatus): Promise<{ id: string; status: string }> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${productId} not found.` });
    }

    if (status === ProductStatus.PUBLISHED) {
      const details = await this.gatherPublishDetails(product);
      if (details.length > 0) {
        throw new UnprocessableEntityException({ code: 'NOT_PUBLISHABLE', details });
      }
    }

    await this.products.update({ id: productId }, { status });
    // Reflect the new status in the storefront index: upsert re-projects when published, removes
    // otherwise (unpublish/archive). Degrades gracefully — never fails the status change (FR-SRCH-072).
    await this.searchIndex.upsert(productId);
    return { id: productId, status };
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async softDelete(productId: string): Promise<void> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${productId} not found.` });
    }
    if (await this.isReferencedByOrder(productId)) {
      throw new ConflictException({
        code: 'PRODUCT_IN_ORDER',
        message: 'Product is referenced by a non-cancelled order; archive it instead.',
      });
    }
    await this.products.softDelete(productId);
    // Drop the product from the storefront index (idempotent; graceful).
    await this.searchIndex.remove(productId);
  }

  // ---------------------------------------------------------------------------
  // Admin list
  // ---------------------------------------------------------------------------

  async list(
    filter: AdminProductListFilter & { page: number; limit: number },
    now: Date = new Date(),
  ): Promise<Paginated<AdminProductRow>> {
    const qb = this.buildListQuery(filter);
    const total = await qb.getCount();
    const rawRows = await qb
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .getRawMany<AdminProductRawRow>();

    const items = await this.mapListRows(rawRows, now);
    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
  }

  /** The full filtered set (no pagination) for the CSV export (SRS §10). */
  async exportRows(filter: AdminProductListFilter, now: Date = new Date()): Promise<AdminProductRow[]> {
    const rawRows = await this.buildListQuery(filter).getRawMany<AdminProductRawRow>();
    return this.mapListRows(rawRows, now);
  }

  /** Shared admin-list query (filters + selected columns), reused by `list` + `exportRows`. */
  private buildListQuery(filter: AdminProductListFilter): SelectQueryBuilder<ProductOrmEntity> {
    const qb = this.products
      .createQueryBuilder('p')
      .leftJoin(AttributeFamilyOrmEntity, 'f', 'f.id = p.family_id')
      .leftJoin(CategoryOrmEntity, 'pc', 'pc.id = p.primary_category_id')
      .leftJoin(ProductImageOrmEntity, 'img', 'img.id = p.primary_image_id')
      .select('p.id', 'id')
      .addSelect('p.name', 'name')
      .addSelect('p.sku', 'sku')
      .addSelect('p.type', 'type')
      .addSelect('f.code', 'family')
      .addSelect('img.url', 'primary_image')
      .addSelect('p.base_price', 'base_price')
      .addSelect('p.sale_price', 'sale_price')
      .addSelect('p.sale_starts_at', 'sale_starts_at')
      .addSelect('p.sale_ends_at', 'sale_ends_at')
      .addSelect('p.status', 'status')
      .addSelect('pc.name', 'primary_category')
      .orderBy('p.created_at', 'DESC');

    if (filter.status) qb.andWhere('p.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('p.type = :type', { type: filter.type });
    if (filter.family) {
      qb.andWhere('(f.code = :family OR p.family_id::text = :family)', { family: filter.family });
    }
    if (filter.category) {
      // Accept a category id (UUID) OR its slug — mirrors the family filter (code-or-id). The admin
      // filter sends the slug (e.g. `football`); matching only by id previously returned zero rows
      // for any selection. Matches the product's primary category OR any linked category.
      qb.andWhere(
        `(p.primary_category_id::text = :category
            OR pc.slug = :category
            OR EXISTS (
              SELECT 1 FROM "product_categories" pcj
                JOIN "categories" cc ON cc.id = pcj."category_id"
               WHERE pcj."product_id" = p.id
                 AND (pcj."category_id"::text = :category OR cc.slug = :category)))`,
        { category: filter.category },
      );
    }
    if (filter.q) {
      qb.andWhere('(p.name ILIKE :q OR p.sku ILIKE :q)', { q: `%${filter.q}%` });
    }
    return qb;
  }

  /** Join live INV stock (BR-CAT-5) + derive sale_active (BR-CAT-4) onto the raw rows. */
  private async mapListRows(rawRows: AdminProductRawRow[], now: Date): Promise<AdminProductRow[]> {
    const stockMap = await this.inventoryQty.getStockByProductIds(rawRows.map((r) => r.id));
    return rawRows.map((r) => {
      const stock = stockMap.get(r.id);
      return {
        id: r.id,
        name: r.name,
        sku: r.sku,
        type: r.type,
        family: r.family,
        primary_image: r.primary_image,
        base_price: r.base_price,
        sale_price: r.sale_price,
        sale_active: this.isSaleActiveRow(r, now),
        status: r.status,
        primary_category: r.primary_category,
        qty: stock ? stock.qty : null,
        qty_status: stock ? stock.qty_status : null,
      };
    });
  }

  /** A row's sale is active only when a sale price is set and now ∈ [sale_starts_at, sale_ends_at] (BR-CAT-4). */
  private isSaleActiveRow(r: AdminProductRawRow, now: Date): boolean {
    if (r.sale_price === null || !r.sale_starts_at || !r.sale_ends_at) return false;
    const starts = new Date(r.sale_starts_at);
    const ends = new Date(r.sale_ends_at);
    return now >= starts && now <= ends;
  }

  /**
   * Bulk publish/archive (SRS §10; FR-CAT-015/016). Runs the **same** per-product validation as the
   * single-product transition (publish-trinity for `published`), returning **per-item** results and
   * never aborting the batch on an individual failure.
   */
  async bulkStatus(ids: string[], status: ProductStatus): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    results: BulkStatusResultItem[];
  }> {
    const results: BulkStatusResultItem[] = [];
    for (const id of ids) {
      results.push(await this.applyBulkStatus(id, status));
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { processed: results.length, succeeded, failed: results.length - succeeded, results };
  }

  private async applyBulkStatus(id: string, status: ProductStatus): Promise<BulkStatusResultItem> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) {
      return { id, ok: false, code: 'PRODUCT_NOT_FOUND' };
    }
    if (status === ProductStatus.PUBLISHED) {
      const details = await this.gatherPublishDetails(product);
      if (details.length > 0) {
        return { id, ok: false, code: 'NOT_PUBLISHABLE', details };
      }
    }
    await this.products.update({ id }, { status });
    // Mirror to the storefront index (idempotent + graceful), same as the single transition.
    await this.searchIndex.upsert(id);
    return { id, ok: true, status };
  }

  // ---------------------------------------------------------------------------
  // Publish-trinity gathering (shared with the status endpoint)
  // ---------------------------------------------------------------------------

  private async gatherPublishDetails(product: ProductOrmEntity): Promise<string[]> {
    const hasPrimaryImage =
      product.primaryImageId !== null &&
      (await this.images.count({ where: { id: product.primaryImageId, isPrimary: true } })) > 0;

    // Simple products have one implicit, always-enabled SKU; configurable products defer to the
    // variants slice via the publish port (returns 0 until catalog-variants-be backs it).
    const enabledVariantCount =
      product.type === ProductType.SIMPLE
        ? 1
        : await this.variantPublish.countEnabledVariants(product.id);

    const familyAttributes = await this.support.getFamilyAttributes(product.familyId);
    const presentAttributeIds = new Set(
      (
        await this.dataSource
          .getRepository(ProductAttributeValueOrmEntity)
          .find({ where: { productId: product.id }, select: { attributeId: true } })
      ).map((row) => row.attributeId),
    );
    const missingRequiredAttributeCodes: string[] = [];
    for (const [code, attribute] of familyAttributes) {
      // Only user-defined attributes live in the EAV table. System attributes (sku/name/price/url_key,
      // isUserDefined=false) are stored on the product columns, so they're never present in
      // product_attribute_values and must NOT be required-checked here — otherwise nothing publishes.
      if (attribute.isRequired && attribute.isUserDefined && !presentAttributeIds.has(attribute.id)) {
        missingRequiredAttributeCodes.push(code);
      }
    }

    return this.publishValidator.validate({
      type: product.type as ProductType,
      hasPrimaryImage,
      enabledVariantCount,
      missingRequiredAttributeCodes,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private validateSaleWindow(
    basePrice: string,
    salePrice: string | null | undefined,
    startsAt: string | null | undefined,
    endsAt: string | null | undefined,
  ): void {
    if (salePrice === null || salePrice === undefined) return;
    if (!startsAt || !endsAt) {
      throw new BadRequestException({
        code: 'INVALID_SALE_WINDOW',
        message: 'sale_price requires both sale_starts_at and sale_ends_at.',
      });
    }
    const sale = Number(salePrice);
    const base = Number(basePrice);
    if (!(sale > 0 && sale < base)) {
      throw new BadRequestException({
        code: 'INVALID_SALE_PRICE',
        message: 'sale_price must be greater than 0 and less than base_price.',
      });
    }
    if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
      throw new BadRequestException({
        code: 'INVALID_SALE_WINDOW',
        message: 'sale_starts_at must be before sale_ends_at.',
      });
    }
  }

  private async assertAdditionalCategoriesExist(categoryIds: string[]): Promise<void> {
    const unique = Array.from(new Set(categoryIds));
    if (unique.length === 0) return;
    const found = await this.categories.find({ where: { id: In(unique) }, select: { id: true } });
    const foundIds = new Set(found.map((c) => c.id));
    const unknown = unique.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      throw new NotFoundException({
        code: 'CATEGORY_NOT_FOUND',
        message: `Unknown category ids: ${unknown.join(', ')}.`,
      });
    }
  }

  /** Validate each submitted attribute against the family + its type/options (FR-CAT-053, BR-CAT-11). */
  private async resolveAttributeValues(
    familyAttributes: Map<string, Attribute>,
    attributes: Record<string, unknown>,
  ): Promise<ResolvedAttributeValue[]> {
    const resolved: ResolvedAttributeValue[] = [];
    for (const [code, rawValue] of Object.entries(attributes)) {
      const attribute = familyAttributes.get(code);
      if (!attribute) {
        throw new BadRequestException({
          code: 'ATTRIBUTE_NOT_IN_FAMILY',
          message: `Attribute "${code}" is not part of the product's family.`,
        });
      }
      this.assignmentValidator.assertValid(attribute, rawValue);
      resolved.push(...this.toValueRows(attribute, rawValue));
    }
    return resolved;
  }

  /** Map a validated value into typed EAV rows (one row, or one per option for multiselect). */
  private toValueRows(attribute: Attribute, rawValue: unknown): ResolvedAttributeValue[] {
    const empty = rawValue === null || rawValue === undefined || rawValue === '';
    if (empty) return [];

    const optionIdFor = (candidate: string): string | null => {
      const opt = attribute.options.find((o) => o.value === candidate || o.id === candidate);
      return opt ? opt.id : null;
    };

    switch (attribute.type) {
      case AttributeType.SELECT:
        return [{ attributeId: attribute.id, optionId: optionIdFor(String(rawValue)) }];
      case AttributeType.MULTISELECT:
        return (rawValue as string[]).map((entry) => ({
          attributeId: attribute.id,
          optionId: optionIdFor(entry),
        }));
      case AttributeType.BOOLEAN:
        return [{ attributeId: attribute.id, valueBoolean: Boolean(rawValue) }];
      case AttributeType.INTEGER:
      case AttributeType.DECIMAL:
      case AttributeType.PRICE:
        return [{ attributeId: attribute.id, valueDecimal: String(Number(rawValue)) }];
      case AttributeType.DATE:
      case AttributeType.DATETIME:
        return [{ attributeId: attribute.id, valueDatetime: new Date(rawValue as string) }];
      default:
        return [{ attributeId: attribute.id, valueText: String(rawValue) }];
    }
  }

  private async persistAttributeValues(
    manager: EntityManager,
    productId: string,
    values: ResolvedAttributeValue[],
  ): Promise<void> {
    if (values.length === 0) return;
    const repo = manager.getRepository(ProductAttributeValueOrmEntity);
    await repo.insert(
      values.map((v) => ({
        productId,
        attributeId: v.attributeId,
        optionId: v.optionId ?? null,
        valueText: v.valueText ?? null,
        valueDecimal: v.valueDecimal ?? null,
        valueBoolean: v.valueBoolean ?? null,
        valueDatetime: v.valueDatetime ?? null,
      })),
    );
  }

  private async replaceAdditionalCategories(
    manager: EntityManager,
    productId: string,
    categoryIds: string[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductCategoryOrmEntity);
    await repo.delete({ productId });
    const unique = Array.from(new Set(categoryIds));
    if (unique.length > 0) {
      await repo.insert(unique.map((categoryId) => ({ productId, categoryId })));
    }
  }

  /**
   * Order-reference guard (FR-CAT-017, §12.10). Probes the as-yet-unbuilt `orders` schema via
   * information_schema; degrades to "no references" until ORD lands, then lights up automatically.
   */
  private async isReferencedByOrder(productId: string): Promise<boolean> {
    const tables = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' LIMIT 1`,
    );
    if (tables.length === 0) return false;
    try {
      const rows = await this.dataSource.query(
        `SELECT 1
           FROM "order_items" oi
           JOIN "orders" o ON o."id" = oi."order_id"
          WHERE oi."product_id" = $1 AND o."status" <> 'cancelled'
          LIMIT 1`,
        [productId],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}

interface ResolvedAttributeValue {
  attributeId: string;
  optionId?: string | null;
  valueText?: string | null;
  valueDecimal?: string | null;
  valueBoolean?: boolean | null;
  valueDatetime?: Date | null;
}
