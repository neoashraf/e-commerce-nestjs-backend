import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { AttributeOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { CategoryFilterableAttributeOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category-filterable-attribute.orm-entity';
import { FacetDefinitionOrmEntity } from '../../infrastructure/persistence/typeorm/entities/facet-definition.orm-entity';
import { FacetSource, FacetType } from '../../domain/search-enums';
import { ResolvedFacet } from './facet.types';

export interface CreateFacetInput {
  key: string;
  label: string;
  type: FacetType;
  source: FacetSource;
  source_attribute_key?: string | null;
  is_multi_select?: boolean;
  hide_zero_counts?: boolean;
  display_order?: number;
  is_active?: boolean;
}

/** Sources that are always applicable to a category listing regardless of its filterable selection. */
const ALWAYS_ON_SOURCES = new Set<string>([
  FacetSource.BRAND,
  FacetSource.PRICE,
  FacetSource.AVAILABILITY,
  FacetSource.VARIANT_COLOR,
  FacetSource.VARIANT_SIZE,
]);

/**
 * FacetDefinition config + applicable-facet resolution + admin CRUD (FR-SRCH-035; §13). For a **category**
 * listing the applicable facets = active definitions whose source attribute is in that category's
 * `CategoryFilterableAttribute` selection, PLUS the always-on brand/price/availability/color/size/on-sale,
 * ordered by display_order. For **search** scope all active facets apply. Admin CRUD validates a unique
 * `key` and a present `source_attribute_key` when `source=attribute` (§11).
 */
@Injectable()
export class FacetResolverService {
  constructor(
    @InjectRepository(FacetDefinitionOrmEntity)
    private readonly facets: Repository<FacetDefinitionOrmEntity>,
    @InjectRepository(CategoryFilterableAttributeOrmEntity)
    private readonly categoryFilterables: Repository<CategoryFilterableAttributeOrmEntity>,
    @InjectRepository(AttributeOrmEntity)
    private readonly attributes: Repository<AttributeOrmEntity>,
  ) {}

  /** All active facets (search scope), ordered. */
  async resolveForSearch(): Promise<ResolvedFacet[]> {
    const rows = await this.facets.find({ where: { isActive: true }, order: { displayOrder: 'ASC' } });
    return rows.map((r) => this.toResolved(r));
  }

  /** Active facets ∩ the category's filterable attribute selection (+ always-on sources), ordered. */
  async resolveForCategory(categoryId: string): Promise<ResolvedFacet[]> {
    const active = await this.facets.find({ where: { isActive: true }, order: { displayOrder: 'ASC' } });
    const selection = await this.categoryFilterables.find({ where: { categoryId } });
    if (selection.length === 0) {
      // No per-category selection configured → apply all active facets (graceful default).
      return active.map((r) => this.toResolved(r));
    }
    const selectedAttrIds = selection.map((s) => s.attributeId);
    const selectedCodes = new Set(
      (await this.attributes.find({ where: { id: In(selectedAttrIds) } })).map((a) => a.code),
    );

    return active
      .filter((f) => {
        if (ALWAYS_ON_SOURCES.has(f.source)) return true;
        if (f.source === FacetSource.ATTRIBUTE) {
          // on_sale has source=attribute with a null key — it is always-on.
          if (!f.sourceAttributeKey) return true;
          return selectedCodes.has(f.sourceAttributeKey);
        }
        // category source is always-on (the scope itself).
        return f.source === FacetSource.CATEGORY;
      })
      .map((r) => this.toResolved(r));
  }

  // --- Admin CRUD ---

  list(): Promise<FacetDefinitionOrmEntity[]> {
    return this.facets.find({ order: { displayOrder: 'ASC' } });
  }

  async create(input: CreateFacetInput): Promise<FacetDefinitionOrmEntity> {
    await this.assertKeyFree(input.key, null);
    this.assertAttributeSource(input.source, input.source_attribute_key ?? null);
    return this.facets.save(
      this.facets.create({
        key: input.key,
        label: input.label,
        type: input.type,
        source: input.source,
        sourceAttributeKey: input.source_attribute_key ?? null,
        isMultiSelect: input.is_multi_select ?? true,
        hideZeroCounts: input.hide_zero_counts ?? true,
        displayOrder: input.display_order ?? 0,
        isActive: input.is_active ?? true,
      }),
    );
  }

  async update(id: string, input: Partial<CreateFacetInput>): Promise<FacetDefinitionOrmEntity> {
    const row = await this.facets.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'FACET_NOT_FOUND', message: `Facet ${id} not found.` });
    if (input.key !== undefined && input.key !== row.key) {
      await this.assertKeyFree(input.key, id);
      row.key = input.key;
    }
    const nextSource = (input.source ?? row.source) as FacetSource;
    const nextAttrKey =
      input.source_attribute_key !== undefined ? input.source_attribute_key : row.sourceAttributeKey;
    this.assertAttributeSource(nextSource, nextAttrKey);
    if (input.label !== undefined) row.label = input.label;
    if (input.type !== undefined) row.type = input.type;
    if (input.source !== undefined) row.source = input.source;
    if (input.source_attribute_key !== undefined) row.sourceAttributeKey = input.source_attribute_key;
    if (input.is_multi_select !== undefined) row.isMultiSelect = input.is_multi_select;
    if (input.hide_zero_counts !== undefined) row.hideZeroCounts = input.hide_zero_counts;
    if (input.display_order !== undefined) row.displayOrder = input.display_order;
    if (input.is_active !== undefined) row.isActive = input.is_active;
    return this.facets.save(row);
  }

  async remove(id: string): Promise<void> {
    const res = await this.facets.delete({ id });
    if (!res.affected) {
      throw new NotFoundException({ code: 'FACET_NOT_FOUND', message: `Facet ${id} not found.` });
    }
  }

  // --- helpers ---

  private toResolved(r: FacetDefinitionOrmEntity): ResolvedFacet {
    return {
      key: r.key,
      label: r.label,
      type: r.type as FacetType,
      source: r.source as FacetSource,
      sourceAttributeKey: r.sourceAttributeKey,
      isMultiSelect: r.isMultiSelect,
      hideZeroCounts: r.hideZeroCounts,
      displayOrder: r.displayOrder,
    };
  }

  private async assertKeyFree(key: string, excludeId: string | null): Promise<void> {
    const existing = await this.facets.findOne({ where: { key } });
    if (existing && existing.id !== excludeId) {
      throw new BadRequestException({
        code: 'FACET_KEY_EXISTS',
        message: `Facet key "${key}" already exists.`,
      });
    }
  }

  private assertAttributeSource(source: FacetSource, attrKey: string | null): void {
    // Admin-authored attribute facets MUST carry a source_attribute_key (§11, AC7). The seeded on_sale
    // convenience facet (attribute source, null key) is inserted via migration, bypassing this guard.
    if (source === FacetSource.ATTRIBUTE && (attrKey === null || attrKey.trim() === '')) {
      throw new BadRequestException({
        code: 'SOURCE_ATTRIBUTE_KEY_REQUIRED',
        message: 'source_attribute_key is required when source = attribute.',
      });
    }
  }
}
