import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';

import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { FacetBlock, ParsedFilters, ResolvedFacet } from './facet.types';
import { FacetCountService, ScopedQueryFactory } from './facet-count.service';
import { FacetFilterService } from './facet-filter.service';
import { FacetResolverService } from './facet-resolver.service';

/**
 * Facade the listing + search services use to apply faceting (FR-SRCH-003/030–034). It resolves the
 * applicable facet set, parses the active filters from raw params, applies them to the main result query
 * (before sort/paging), builds the live facet-count blocks (each excluding its own selections), and shapes
 * the `applied_filters` block. Counts come from the index — no DB scan (§12.8). The facets sibling owns
 * this; search-browse-be's listing/search services delegate to it via this single seam.
 */
@Injectable()
export class FacetService {
  constructor(
    private readonly resolver: FacetResolverService,
    private readonly filterService: FacetFilterService,
    private readonly countService: FacetCountService,
  ) {}

  resolveForCategory(categoryId: string): Promise<ResolvedFacet[]> {
    return this.resolver.resolveForCategory(categoryId);
  }

  resolveForSearch(): Promise<ResolvedFacet[]> {
    return this.resolver.resolveForSearch();
  }

  parse(raw: Record<string, string | string[]>, applicable: ResolvedFacet[]): ParsedFilters {
    return this.filterService.parse(raw, applicable);
  }

  /** Apply ALL active filters to the main listing/search query (before sort/paging). */
  applyAll(
    qb: SelectQueryBuilder<ProductSearchDocumentOrmEntity>,
    filters: ParsedFilters,
    applicable: ResolvedFacet[],
  ): void {
    this.filterService.apply(qb, filters, applicable, null, 0);
  }

  /** Build the per-facet count blocks for the response (FR-SRCH-003/032/033). */
  buildBlocks(
    applicable: ResolvedFacet[],
    filters: ParsedFilters,
    scopedQuery: ScopedQueryFactory,
  ): Promise<FacetBlock[]> {
    return this.countService.build(applicable, filters, scopedQuery);
  }

  /** Shape the contract `applied_filters` object from the parsed selections. */
  appliedFilters(filters: ParsedFilters): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, values] of filters.terms.entries()) result[key] = values;
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
      result.price = {
        ...(filters.priceMin !== undefined ? { min: filters.priceMin.toFixed(2) } : {}),
        ...(filters.priceMax !== undefined ? { max: filters.priceMax.toFixed(2) } : {}),
      };
    }
    if (filters.inStockOnly) result.in_stock = true;
    if (filters.onSaleOnly) result.on_sale = true;
    return result;
  }
}
