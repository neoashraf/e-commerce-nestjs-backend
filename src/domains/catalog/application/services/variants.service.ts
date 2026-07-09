import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { AttributeType } from '../../domain/enums/attribute-type.enum';
import { ProductType } from '../../domain/enums/product-type.enum';
import {
  ATTRIBUTE_REPOSITORY,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';
import { ProductConfigurableAttributeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';
import { ProductImageOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVariantOptionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductVariantOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';
import { INVENTORY_ADMIN_PORT, IInventoryAdminPort } from '../ports/inventory-admin.port';

export interface ConfigurableAxisInput {
  code: string;
  optionIds: string[];
}

export interface GeneratedVariant {
  id: string;
  sku_code: string;
  options: Record<string, string>;
}

export interface UpdateVariantInput {
  id: string;
  skuCode?: string;
  priceOverride?: string | null;
  imageId?: string | null;
  isEnabled?: boolean;
}

interface ResolvedAxis {
  attributeId: string;
  code: string;
  /** option_id → token used in SKU derivation (the option value uppercased). */
  options: { id: string; token: string }[];
}

/**
 * Configurable-variant write model (FR-CAT-020–027): set a product's configurable axes, expand the
 * Cartesian matrix into unique SKUs (append-only on re-generate), edit per-variant price/image/enable,
 * the ≥1-enabled publish-gate (consumed by products-be), and the option-removal order guard. The
 * variant `id` is the stable `variant_id` and is never renumbered.
 */
@Injectable()
export class VariantsService {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @InjectRepository(ProductVariantOrmEntity)
    private readonly variants: Repository<ProductVariantOrmEntity>,
    @InjectRepository(ProductVariantOptionOrmEntity)
    private readonly variantOptions: Repository<ProductVariantOptionOrmEntity>,
    @InjectRepository(ProductImageOrmEntity)
    private readonly images: Repository<ProductImageOrmEntity>,
    @InjectRepository(ProductConfigurableAttributeOrmEntity)
    private readonly configurableAttributes: Repository<ProductConfigurableAttributeOrmEntity>,
    @Inject(ATTRIBUTE_REPOSITORY)
    private readonly attributes: IAttributeRepository,
    private readonly dataSource: DataSource,
    @Inject(INVENTORY_ADMIN_PORT)
    private readonly inventoryAdmin: IInventoryAdminPort,
  ) {}

  // ---------------------------------------------------------------------------
  // Generate / re-generate the matrix
  // ---------------------------------------------------------------------------

  async generate(
    productId: string,
    axes: ConfigurableAxisInput[],
  ): Promise<{ variants_created: number; variants: GeneratedVariant[] }> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product ${productId} not found.` });
    }
    if (product.type !== ProductType.CONFIGURABLE) {
      throw new BadRequestException({
        code: 'NOT_CONFIGURABLE',
        message: 'Variants can only be generated for a configurable product.',
      });
    }
    if (axes.length === 0) {
      throw new BadRequestException({
        code: 'NO_CONFIGURABLE_ATTRIBUTES',
        message: 'At least one configurable attribute is required.',
      });
    }

    const resolved = await this.resolveAxes(axes);

    // Cartesian product of the axes → coordinate maps (attributeId → optionId).
    const coordinates = this.cartesian(resolved);

    // Existing variant coordinates (to append only the new combinations, FR-CAT-021).
    const existing = await this.loadExistingCoordinates(productId);

    const created: GeneratedVariant[] = [];
    await this.dataSource.transaction(async (manager) => {
      // Persist/refresh the configurable-axis set (full replace; preserves variants).
      await this.persistConfigurableAttributes(manager, productId, resolved);

      for (const coord of coordinates) {
        const key = this.coordinateKey(coord);
        if (existing.has(key)) continue; // preserve existing variant + its edits

        const skuCode = this.deriveSku(product.sku, coord, resolved);
        await this.assertSkuFree(manager, skuCode);

        const variantRepo = manager.getRepository(ProductVariantOrmEntity);
        const saved = await variantRepo.save(
          variantRepo.create({
            productId,
            skuCode,
            priceOverride: null,
            imageId: null,
            isEnabled: true,
          }),
        );
        const optionRepo = manager.getRepository(ProductVariantOptionOrmEntity);
        await optionRepo.insert(
          Object.entries(coord).map(([attributeId, optionId]) => ({
            variantId: saved.id,
            attributeId,
            optionId,
          })),
        );

        created.push({
          id: saved.id,
          sku_code: skuCode,
          options: this.toCodeOptionMap(coord, resolved),
        });
        existing.add(key);
      }
    });

    // FR-INV-002: every new variant gets a zero-stock inventory record so it is immediately
    // stock-manageable (editor grid / inventory page). Done after commit; INV degrades gracefully.
    for (const variant of created) {
      await this.inventoryAdmin.ensureRecordForVariant(variant.id, productId);
    }

    return { variants_created: created.length, variants: created };
  }

  // ---------------------------------------------------------------------------
  // Per-variant edit
  // ---------------------------------------------------------------------------

  async update(input: UpdateVariantInput): Promise<{ id: string }> {
    const variant = await this.variants.findOne({ where: { id: input.id } });
    if (!variant) {
      throw new NotFoundException({ code: 'VARIANT_NOT_FOUND', message: `Variant ${input.id} not found.` });
    }

    if (input.skuCode !== undefined && input.skuCode !== variant.skuCode) {
      if (await this.skuExists(input.skuCode, variant.id)) {
        throw new ConflictException({
          code: 'SKU_NOT_UNIQUE',
          message: `SKU "${input.skuCode}" is already in use.`,
        });
      }
    }

    // image_id (when set, not cleared) must reference an image of this variant's product (FR-CAT-023).
    if (input.imageId !== undefined && input.imageId !== null) {
      const image = await this.images.findOne({
        where: { id: input.imageId, productId: variant.productId },
      });
      if (!image) {
        throw new BadRequestException({
          code: 'IMAGE_NOT_FOR_PRODUCT',
          message: `Image ${input.imageId} does not belong to this variant's product.`,
        });
      }
    }

    const patch: Partial<ProductVariantOrmEntity> = {};
    if (input.skuCode !== undefined) patch.skuCode = input.skuCode;
    if (input.priceOverride !== undefined) patch.priceOverride = input.priceOverride;
    if (input.imageId !== undefined) patch.imageId = input.imageId;
    if (input.isEnabled !== undefined) patch.isEnabled = input.isEnabled;

    if (Object.keys(patch).length > 0) {
      await this.variants.update({ id: variant.id }, patch);
    }
    return { id: variant.id };
  }

  // ---------------------------------------------------------------------------
  // Publish-gate (consumed by products-be via the port)
  // ---------------------------------------------------------------------------

  /** Number of enabled, non-deleted variants of a product (FR-CAT-025, BR-CAT-7). */
  async countEnabledVariants(productId: string): Promise<number> {
    return this.variants.count({ where: { productId, isEnabled: true } });
  }

  // ---------------------------------------------------------------------------
  // Option-removal guard (consumed when removing an option/axis)
  // ---------------------------------------------------------------------------

  /**
   * Whether a configurable option is referenced by a variant in a non-cancelled order (FR-CAT-026,
   * §12.11). Throws `409 OPTION_IN_USE` so the caller offers "disable the variant instead". The
   * order-reference probe degrades to "no references" until ORD lands.
   */
  async assertOptionRemovable(optionId: string): Promise<void> {
    const variantIds = (
      await this.variantOptions.find({ where: { optionId }, select: { variantId: true } })
    ).map((row) => row.variantId);
    if (variantIds.length === 0) return;
    if (await this.anyVariantInOrder(variantIds)) {
      throw new ConflictException({
        code: 'OPTION_IN_USE',
        message: 'Option is used by a variant in a placed order; disable the variant instead.',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async resolveAxes(axes: ConfigurableAxisInput[]): Promise<ResolvedAxis[]> {
    const resolved: ResolvedAxis[] = [];
    for (const axis of axes) {
      const attribute = await this.attributes.findByCode(axis.code);
      if (!attribute) {
        throw new BadRequestException({
          code: 'UNKNOWN_ATTRIBUTE',
          message: `Attribute "${axis.code}" not found.`,
        });
      }
      if (!attribute.isConfigurable || attribute.type !== AttributeType.SELECT) {
        throw new BadRequestException({
          code: 'NOT_CONFIGURABLE_ATTRIBUTE',
          message: `Attribute "${axis.code}" must be is_configurable and of type select.`,
        });
      }
      if (axis.optionIds.length === 0) {
        throw new BadRequestException({
          code: 'EMPTY_OPTION_SET',
          message: `Attribute "${axis.code}" needs at least one option.`,
        });
      }
      const options = axis.optionIds.map((optionId) => {
        const opt = attribute.options.find((o) => o.id === optionId || o.value === optionId);
        if (!opt) {
          throw new BadRequestException({
            code: 'UNKNOWN_OPTION',
            message: `Option "${optionId}" is not valid for attribute "${axis.code}".`,
          });
        }
        return { id: opt.id, token: this.tokenize(opt.value) };
      });
      resolved.push({ attributeId: attribute.id, code: axis.code, options });
    }
    return resolved;
  }

  /** Build the Cartesian product of the axes as an array of (attributeId → optionId) maps. */
  private cartesian(axes: ResolvedAxis[]): Record<string, string>[] {
    let acc: Record<string, string>[] = [{}];
    for (const axis of axes) {
      const next: Record<string, string>[] = [];
      for (const partial of acc) {
        for (const opt of axis.options) {
          next.push({ ...partial, [axis.attributeId]: opt.id });
        }
      }
      acc = next;
    }
    return acc;
  }

  private deriveSku(parentSku: string, coord: Record<string, string>, axes: ResolvedAxis[]): string {
    const tokens = axes.map((axis) => {
      const optionId = coord[axis.attributeId];
      const opt = axis.options.find((o) => o.id === optionId);
      return opt ? opt.token : 'X';
    });
    return [parentSku, ...tokens].join('-');
  }

  private toCodeOptionMap(coord: Record<string, string>, axes: ResolvedAxis[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const axis of axes) map[axis.code] = coord[axis.attributeId];
    return map;
  }

  private coordinateKey(coord: Record<string, string>): string {
    return Object.entries(coord)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([attr, opt]) => `${attr}:${opt}`)
      .join('|');
  }

  private async loadExistingCoordinates(productId: string): Promise<Set<string>> {
    const variantRows = await this.variants.find({
      where: { productId },
      select: { id: true },
    });
    const keys = new Set<string>();
    if (variantRows.length === 0) return keys;
    const optionRows = await this.variantOptions.find({
      where: { variantId: In(variantRows.map((v) => v.id)) },
    });
    const byVariant = new Map<string, Record<string, string>>();
    for (const row of optionRows) {
      const coord = byVariant.get(row.variantId) ?? {};
      coord[row.attributeId] = row.optionId;
      byVariant.set(row.variantId, coord);
    }
    for (const coord of byVariant.values()) keys.add(this.coordinateKey(coord));
    return keys;
  }

  private async persistConfigurableAttributes(
    manager: EntityManager,
    productId: string,
    axes: ResolvedAxis[],
  ): Promise<void> {
    const repo = manager.getRepository(ProductConfigurableAttributeOrmEntity);
    await repo.delete({ productId });
    await repo.insert(
      axes.map((axis, idx) => ({ productId, attributeId: axis.attributeId, position: idx + 1 })),
    );
  }

  private tokenize(value: string): string {
    return value
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .slice(0, 8) || 'X';
  }

  private async skuExists(skuCode: string, excludeId?: string): Promise<boolean> {
    const qb = this.variants
      .createQueryBuilder('v')
      .withDeleted()
      .where('v.sku_code = :skuCode', { skuCode });
    if (excludeId) qb.andWhere('v.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  private async assertSkuFree(manager: EntityManager, skuCode: string): Promise<void> {
    const count = await manager
      .getRepository(ProductVariantOrmEntity)
      .createQueryBuilder('v')
      .withDeleted()
      .where('v.sku_code = :skuCode', { skuCode })
      .getCount();
    // Also guard against parent product SKU collisions (variants share the SKU namespace).
    const productCollision = await manager
      .getRepository(ProductOrmEntity)
      .createQueryBuilder('p')
      .withDeleted()
      .where('p.sku = :skuCode', { skuCode })
      .getCount();
    if (count > 0 || productCollision > 0) {
      throw new ConflictException({
        code: 'SKU_NOT_UNIQUE',
        message: `Generated SKU "${skuCode}" collides with an existing SKU.`,
      });
    }
  }

  /** Probe ORD for a variant referenced by a non-cancelled order; degrades until ORD lands. */
  private async anyVariantInOrder(variantIds: string[]): Promise<boolean> {
    const tables = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = 'order_items' LIMIT 1`,
    );
    if (tables.length === 0) return false;
    try {
      const rows = await this.dataSource.query(
        `SELECT 1
           FROM "order_items" oi
           JOIN "orders" o ON o."id" = oi."order_id"
          WHERE oi."variant_id" = ANY($1) AND o."status" <> 'cancelled'
          LIMIT 1`,
        [variantIds],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
