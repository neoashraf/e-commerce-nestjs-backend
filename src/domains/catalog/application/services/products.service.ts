import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

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
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductLinkOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { AttributeAssignmentValidator } from './attribute-assignment.validator';
import {
  INVENTORY_QTY_PORT,
  IInventoryQtyPort,
} from '../ports/inventory-qty.port';
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
  status: string;
  primary_category: string | null;
  qty: number | null;
}

/** Full product detail for the admin editor (all editable fields + `updated_at` for optimistic writes). */
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

    const id = await this.dataSource.transaction(async (manager) => {
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
      return saved.id;
    });

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
      meta_title: p.metaTitle,
      meta_keywords: p.metaKeywords,
      meta_description: p.metaDescription,
      attributes,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
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
      // multiselect persists one row per option → collect repeated codes into an array.
      if (out[code] === undefined) out[code] = value;
      else out[code] = Array.isArray(out[code]) ? [...(out[code] as unknown[]), value] : [out[code], value];
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

  async list(filter: {
    page: number;
    limit: number;
    status?: ProductStatus;
    type?: ProductType;
    family?: string;
    category?: string;
    q?: string;
  }): Promise<Paginated<AdminProductRow>> {
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
      .addSelect('p.status', 'status')
      .addSelect('pc.name', 'primary_category')
      .orderBy('p.created_at', 'DESC');

    if (filter.status) qb.andWhere('p.status = :status', { status: filter.status });
    if (filter.type) qb.andWhere('p.type = :type', { type: filter.type });
    if (filter.family) {
      qb.andWhere('(f.code = :family OR p.family_id::text = :family)', { family: filter.family });
    }
    if (filter.category) {
      qb.andWhere(
        `(p.primary_category_id::text = :category OR EXISTS (
            SELECT 1 FROM "product_categories" pcj
             WHERE pcj."product_id" = p.id AND pcj."category_id"::text = :category))`,
        { category: filter.category },
      );
    }
    if (filter.q) {
      qb.andWhere('(p.name ILIKE :q OR p.sku ILIKE :q)', { q: `%${filter.q}%` });
    }

    const total = await qb.getCount();
    const rawRows = await qb
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .getRawMany<Omit<AdminProductRow, 'qty'>>();

    const qtyMap = await this.inventoryQty.getQtyByProductIds(rawRows.map((r) => r.id));
    const items: AdminProductRow[] = rawRows.map((r) => ({
      ...r,
      qty: qtyMap.has(r.id) ? (qtyMap.get(r.id) as number) : null,
    }));

    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
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
