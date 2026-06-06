import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';

import { AttributeOptionOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { FacetSource, FacetType } from '../../domain/search-enums';
import { FacetBlock, FacetValue, ParsedFilters, ResolvedFacet } from './facet.types';
import { FacetFilterService } from './facet-filter.service';

/** A factory the caller provides so the count service rebuilds a scoped base query per facet pass. */
export type ScopedQueryFactory = () => SelectQueryBuilder<ProductSearchDocumentOrmEntity>;

/**
 * Live per-value facet counts (FR-SRCH-003/032/033, BR-SRCH-4; §12.8). Each facet's counts are computed
 * over the scoped result set with **all other** active filters applied but that facet's own selections
 * excluded (so OR-within stays additive). Counts come from the index (`product_search_document`) by
 * fetching the facet-relevant columns of the constrained candidate set and aggregating in memory — no DB
 * table scan of CAT/INV, no N+1. Zero-count values are hidden when `hide_zero_counts` is set, and an
 * all-zero facet is omitted; price returns min/max bounds; boolean returns its count.
 */
@Injectable()
export class FacetCountService {
  constructor(
    @InjectRepository(AttributeOptionOrmEntity)
    private readonly options: Repository<AttributeOptionOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    private readonly filterService: FacetFilterService,
  ) {}

  async build(
    facets: ResolvedFacet[],
    filters: ParsedFilters,
    scopedQuery: ScopedQueryFactory,
  ): Promise<FacetBlock[]> {
    const blocks: FacetBlock[] = [];
    let seq = 100; // param-namespace offset, distinct from the listing query's binds
    for (const facet of facets) {
      const block = await this.buildFacet(facet, facets, filters, scopedQuery, seq++);
      if (block) blocks.push(block);
    }
    return blocks;
  }

  private async buildFacet(
    facet: ResolvedFacet,
    allFacets: ResolvedFacet[],
    filters: ParsedFilters,
    scopedQuery: ScopedQueryFactory,
    seq: number,
  ): Promise<FacetBlock | null> {
    // Candidate set = scope + every active filter EXCEPT this facet (BR-SRCH-4).
    const qb = scopedQuery();
    this.filterService.apply(qb, filters, allFacets, facet.key, seq);
    // Fetch only the columns this facet needs (mirror reads, no joins to CAT/INV).
    const rows = await qb
      .select([
        'doc.brand AS brand',
        'doc.colors AS colors',
        'doc.sizes AS sizes',
        'doc.attributes AS attributes',
        'doc.category_ids AS category_ids',
        'doc.effective_price AS effective_price',
        'doc.base_price AS base_price',
        'doc.on_sale AS on_sale',
        'doc.availability AS availability',
      ])
      .getRawMany<RawDoc>();

    switch (facet.type) {
      case FacetType.RANGE:
        return this.buildPriceBlock(facet, rows);
      case FacetType.BOOLEAN:
        return this.buildBooleanBlock(facet, rows);
      case FacetType.TERM:
      default:
        return this.buildTermBlock(facet, rows);
    }
  }

  private buildPriceBlock(facet: ResolvedFacet, rows: RawDoc[]): FacetBlock | null {
    if (rows.length === 0) {
      return facet.hideZeroCounts ? null : { key: facet.key, label: facet.label, type: FacetType.RANGE };
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const r of rows) {
      const price = Number(r.effective_price);
      if (price < min) min = price;
      if (price > max) max = price;
    }
    return {
      key: facet.key,
      label: facet.label,
      type: FacetType.RANGE,
      min: min.toFixed(2),
      max: max.toFixed(2),
    };
  }

  private buildBooleanBlock(facet: ResolvedFacet, rows: RawDoc[]): FacetBlock | null {
    let count = 0;
    if (facet.key === 'on_sale') {
      count = rows.filter((r) => r.on_sale === true).length;
    } else {
      // availability / in-stock-only facet: products that are not out of stock.
      count = rows.filter((r) => r.availability !== 'out_of_stock').length;
    }
    if (count === 0 && facet.hideZeroCounts) return null;
    return { key: facet.key, label: facet.label, type: FacetType.BOOLEAN, count };
  }

  private async buildTermBlock(facet: ResolvedFacet, rows: RawDoc[]): Promise<FacetBlock | null> {
    const counts = new Map<string, number>();
    const inc = (value: string): void => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    };

    for (const r of rows) {
      if (facet.source === FacetSource.BRAND) {
        if (r.brand) inc(r.brand);
      } else if (facet.source === FacetSource.VARIANT_COLOR) {
        for (const id of r.colors ?? []) inc(id);
      } else if (facet.source === FacetSource.VARIANT_SIZE) {
        for (const id of r.sizes ?? []) inc(id);
      } else if (facet.source === FacetSource.CATEGORY) {
        for (const id of r.category_ids ?? []) inc(id);
      } else if (facet.source === FacetSource.ATTRIBUTE && facet.sourceAttributeKey) {
        const labels = (r.attributes ?? {})[facet.sourceAttributeKey] ?? [];
        for (const label of labels) inc(label);
      }
    }

    const values = await this.resolveValues(facet, counts);
    const filtered = facet.hideZeroCounts ? values.filter((v) => v.count > 0) : values;
    if (filtered.length === 0) return null;

    return {
      key: facet.key,
      label: facet.label,
      type: FacetType.TERM,
      multi_select: facet.isMultiSelect,
      values: filtered.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    };
  }

  /** Resolve labels (+ color_hex / category title) for the counted term values. */
  private async resolveValues(
    facet: ResolvedFacet,
    counts: Map<string, number>,
  ): Promise<FacetValue[]> {
    const keys = Array.from(counts.keys());
    if (keys.length === 0) return [];

    if (facet.source === FacetSource.VARIANT_COLOR || facet.source === FacetSource.VARIANT_SIZE) {
      const opts = await this.options.find({ where: { id: In(keys) } });
      const byId = new Map(opts.map((o) => [o.id, o]));
      return keys.map((id) => {
        const opt = byId.get(id);
        const value: FacetValue = { value: id, label: opt?.label ?? id, count: counts.get(id) ?? 0 };
        if (facet.source === FacetSource.VARIANT_COLOR && opt?.swatchType === 'color' && opt.swatchValue) {
          value.color_hex = opt.swatchValue;
        }
        return value;
      });
    }

    if (facet.source === FacetSource.CATEGORY) {
      const cats = await this.categories.find({ where: { id: In(keys) } });
      const byId = new Map(cats.map((c) => [c.id, c]));
      return keys.map((id) => ({
        value: byId.get(id)?.slug ?? id,
        label: byId.get(id)?.name ?? id,
        count: counts.get(id) ?? 0,
      }));
    }

    // brand + attribute facets: the counted key is already the display value/label.
    return keys.map((k) => ({ value: k, label: k, count: counts.get(k) ?? 0 }));
  }
}

interface RawDoc {
  brand: string | null;
  colors: string[] | null;
  sizes: string[] | null;
  attributes: Record<string, string[]> | null;
  category_ids: string[] | null;
  effective_price: string;
  base_price: string;
  on_sale: boolean;
  availability: string;
}
