import { Injectable } from '@nestjs/common';
import { Brackets, SelectQueryBuilder } from 'typeorm';

import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { FacetSource, SearchAvailability } from '../../domain/search-enums';
import { ParsedFilters, ResolvedFacet } from './facet.types';

const RESERVED_PARAMS = new Set(['page', 'limit', 'sort', 'q']);
const PRICE_MIN_PARAM = 'price_min';
const PRICE_MAX_PARAM = 'price_max';
const IN_STOCK_PARAM = 'in_stock';
const ON_SALE_PARAM = 'on_sale';

/**
 * Parses active filter selections from raw query params (FR-SRCH-050/051) and applies them to a document
 * query (FR-SRCH-030/031/034, BR-SRCH-2/3): AND across facets, OR within a multi-select facet. Term facets
 * map to the index `attributes` jsonb (attribute facets), `brand`, or `colors`/`sizes` arrays (enabled-
 * variant options only — §12.7); range = price bounds; boolean = on_sale / in_stock-only (the latter also
 * drops de-prioritized OOS, BR-SRCH-2). Unknown params/values are ignored, never errored. A unique alias
 * suffix lets the count service apply "all filters except this facet" for additive OR-within counts.
 */
@Injectable()
export class FacetFilterService {
  /** Parse raw params into typed selections using the applicable facet set (unknown keys ignored). */
  parse(
    raw: Record<string, string | string[]>,
    applicable: ResolvedFacet[],
  ): ParsedFilters {
    const byKey = new Map(applicable.map((f) => [f.key, f]));
    const terms = new Map<string, string[]>();

    for (const [key, value] of Object.entries(raw)) {
      if (RESERVED_PARAMS.has(key)) continue;
      const facet = byKey.get(key);
      if (!facet) continue; // unknown facet key → ignored (FR-SRCH-051)
      if (facet.source === FacetSource.PRICE || facet.source === FacetSource.AVAILABILITY) continue;
      if (key === ON_SALE_PARAM) continue;
      const values = this.dedupe(this.asArray(value));
      if (values.length > 0) terms.set(key, values);
    }

    const priceMin = this.toNonNegativeNumber(raw[PRICE_MIN_PARAM]);
    const priceMax = this.toNonNegativeNumber(raw[PRICE_MAX_PARAM]);
    // Invalid range (min > max) is ignored (§11) — drop both bounds.
    const validRange = priceMin === undefined || priceMax === undefined || priceMin <= priceMax;

    return {
      terms,
      priceMin: validRange ? priceMin : undefined,
      priceMax: validRange ? priceMax : undefined,
      inStockOnly: this.isTrue(raw[IN_STOCK_PARAM]),
      onSaleOnly: this.isTrue(raw[ON_SALE_PARAM]),
    };
  }

  /**
   * Apply all parsed filters to a document query, optionally **excluding one facet** (for that facet's own
   * additive count, BR-SRCH-4). Returns nothing; mutates the builder. `paramSeq` namespaces bind params so
   * a builder can be reused for multiple facet-count passes.
   */
  apply(
    qb: SelectQueryBuilder<ProductSearchDocumentOrmEntity>,
    filters: ParsedFilters,
    applicable: ResolvedFacet[],
    excludeKey: string | null,
    paramSeq = 0,
  ): void {
    const byKey = new Map(applicable.map((f) => [f.key, f]));
    let p = 0;
    const bind = (v: unknown): string => {
      const name = `f${paramSeq}_${p++}`;
      qb.setParameter(name, v);
      return `:${name}`;
    };

    for (const [key, values] of filters.terms.entries()) {
      if (key === excludeKey) continue;
      const facet = byKey.get(key);
      if (!facet) continue;
      this.applyTerm(qb, facet, values, bind);
    }

    if (excludeKey !== 'price') {
      if (filters.priceMin !== undefined) {
        qb.andWhere(`doc.effective_price >= ${bind(filters.priceMin)}`);
      }
      if (filters.priceMax !== undefined) {
        qb.andWhere(`doc.effective_price <= ${bind(filters.priceMax)}`);
      }
    }
    if (filters.inStockOnly && excludeKey !== 'availability') {
      qb.andWhere(`doc.availability != ${bind(SearchAvailability.OUT_OF_STOCK)}`);
    }
    if (filters.onSaleOnly && excludeKey !== 'on_sale') {
      qb.andWhere(`doc.on_sale = true`);
    }
  }

  private applyTerm(
    qb: SelectQueryBuilder<ProductSearchDocumentOrmEntity>,
    facet: ResolvedFacet,
    values: string[],
    bind: (v: unknown) => string,
  ): void {
    // OR within one facet (BR-SRCH-3) via a bracketed group.
    qb.andWhere(
      new Brackets((w) => {
        if (facet.source === FacetSource.BRAND) {
          w.where(`doc.brand = ANY(${bind(values)}::text[])`);
        } else if (facet.source === FacetSource.VARIANT_COLOR) {
          w.where(`doc.colors && ${bind(values)}::uuid[]`);
        } else if (facet.source === FacetSource.VARIANT_SIZE) {
          w.where(`doc.sizes && ${bind(values)}::uuid[]`);
        } else if (facet.source === FacetSource.ATTRIBUTE && facet.sourceAttributeKey) {
          // attributes jsonb: code → labels[]; match when any selected value is in that array.
          w.where(`doc.attributes -> ${bind(facet.sourceAttributeKey)} ?| ${bind(values)}::text[]`);
        } else if (facet.source === FacetSource.CATEGORY) {
          // category facet values are category ids.
          w.where(`doc.category_ids && ${bind(values)}::uuid[]`);
        } else {
          // unknown/unsupported term source → no-op (always-true to not break AND chain)
          w.where('1 = 1');
        }
      }),
    );
  }

  private asArray(value: string | string[]): string[] {
    return Array.isArray(value) ? value : [value];
  }

  private dedupe(values: string[]): string[] {
    return Array.from(new Set(values.map((v) => String(v).trim()).filter((v) => v !== '')));
  }

  private toNonNegativeNumber(value: string | string[] | undefined): number | undefined {
    if (value === undefined) return undefined;
    const raw = Array.isArray(value) ? value[0] : value;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  private isTrue(value: string | string[] | undefined): boolean {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw === 'true' || raw === '1';
  }
}
