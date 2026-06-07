import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { DataWithMeta } from '../../../../shared/dto/data-with-meta';
import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { SearchScopeType, SortKey } from '../../domain/search-enums';
import { normalizeQuery } from '../../domain/query-normalize';
import { ProductCard, toProductCard } from './product-card.mapper';
import { applySortAndPaging, parseListingOptions } from './listing-query.options';
import { FacetBlock, ParsedFilters, ResolvedFacet } from './facet.types';
import { FacetService } from './facet.service';
import { QueryLogService } from './query-log.service';
import { SearchConfigService } from './search-config.service';

/** Trigram similarity floor for the fuzzy fallback when FTS yields nothing (typo tolerance). */
const TRIGRAM_THRESHOLD = 0.3;
const POPULAR_CATEGORIES_LIMIT = 6;

export interface SearchData {
  scope: { type: SearchScopeType.SEARCH; query: string; normalized?: string };
  redirect: { target_type: string; target_ref: string } | null;
  products: ProductCard[];
  facets: FacetBlock[];
  applied_filters: Record<string, unknown>;
  sort: SortKey;
  suggestions: ZeroResultSuggestions | null;
}

export type SearchResult = DataWithMeta<SearchData>;

export interface ZeroResultSuggestions {
  relaxed_query?: string;
  restricting_filters: string[];
  popular_categories: { slug: string; title: string }[];
}

/**
 * Keyword search (FR-SRCH-010–014, 060/061; BR-SRCH-2/5/6/7/8). Matches the normalized query against the
 * index `search_tsv` via `plainto_tsquery('simple', …)` (UTF-8/Bangla-safe), expanded with active
 * synonyms; ranks by `ts_rank` with in-stock favored at equal relevance (OOS last). When FTS returns
 * nothing it falls back to `pg_trgm` similarity (typo tolerance, §12.5) and surfaces the closest term as
 * `relaxed_query`. An active redirect on the normalized query short-circuits the list (BR-SRCH-7). Every
 * submitted query is logged (FR-SRCH-014); a zero-result response carries recovery suggestions.
 */
@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly documents: Repository<ProductSearchDocumentOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    private readonly config: SearchConfigService,
    private readonly queryLog: QueryLogService,
    private readonly facetService: FacetService,
  ) {}

  async search(
    rawQuery: string,
    rawParams: Record<string, string | string[]>,
    customerId?: string | null,
  ): Promise<SearchResult> {
    const normalized = normalizeQuery(rawQuery);
    const options = parseListingOptions(rawParams, SortKey.RELEVANCE, true);

    // Redirect short-circuit (BR-SRCH-7); the query is still logged (FR-SRCH-014).
    const redirect = await this.config.matchRedirect(normalized);
    if (redirect) {
      await this.safeLog(rawQuery, normalized, 0, customerId);
      return new DataWithMeta<SearchData>(
        {
          scope: { type: SearchScopeType.SEARCH, query: rawQuery, normalized },
          redirect: { target_type: redirect.targetType, target_ref: redirect.targetRef },
          products: [],
          facets: [],
          applied_filters: {},
          sort: options.sort,
          suggestions: null,
        },
        { page: options.page, limit: options.limit, total: 0 },
      );
    }

    const applicable = await this.facetService.resolveForSearch();
    const filters = this.facetService.parse(rawParams, applicable);

    const terms = await this.expandWithSynonyms(normalized);
    const tsQuery = terms.join(' | '); // OR across synonym-expanded terms

    // Scope factory used for both the result query and per-facet counts. FTS scope unless it is empty,
    // then the trigram fuzzy scope (typo tolerance, FR-SRCH-011/§12.5).
    const ftsScope = (): SelectQueryBuilder<ProductSearchDocumentOrmEntity> => this.ftsBase(tsQuery);
    const trigramScope = (): SelectQueryBuilder<ProductSearchDocumentOrmEntity> =>
      this.trigramBase(normalized);

    let scope = ftsScope;
    let rankExpr = `ts_rank(doc.search_tsv, to_tsquery('simple', :tsQuery))`;
    let total = await this.countWith(scope, filters, applicable);
    let relaxedQuery: string | undefined;

    if (total === 0 && normalized !== '') {
      scope = trigramScope;
      rankExpr = `similarity(doc.search_text, :q)`;
      total = await this.countWith(scope, filters, applicable);
    }

    let rows: ProductSearchDocumentOrmEntity[] = [];
    if (total > 0) {
      const qb = scope();
      this.facetService.applyAll(qb, filters, applicable);
      qb.addSelect(rankExpr, 'rank');
      applySortAndPaging(qb, options, true);
      rows = await qb.getMany();
      if (scope === trigramScope) relaxedQuery = rows[0]?.title?.toLowerCase();
    }

    await this.safeLog(rawQuery, normalized, total, customerId);

    const facets = total > 0 ? await this.facetService.buildBlocks(applicable, filters, scope) : [];

    if (total === 0) {
      return new DataWithMeta<SearchData>(
        {
          scope: { type: SearchScopeType.SEARCH, query: rawQuery, normalized },
          redirect: null,
          products: [],
          facets: [],
          applied_filters: this.facetService.appliedFilters(filters),
          sort: options.sort,
          suggestions: await this.buildZeroResultSuggestions(relaxedQuery, filters),
        },
        { page: options.page, limit: options.limit, total: 0 },
      );
    }

    return new DataWithMeta<SearchData>(
      {
        scope: { type: SearchScopeType.SEARCH, query: rawQuery, normalized },
        redirect: null,
        products: rows.map(toProductCard),
        facets,
        applied_filters: this.facetService.appliedFilters(filters),
        sort: options.sort,
        suggestions: null,
      },
      { page: options.page, limit: options.limit, total },
    );
  }

  // ---------------------------------------------------------------------------
  // Scope builders
  // ---------------------------------------------------------------------------

  private ftsBase(tsQuery: string): SelectQueryBuilder<ProductSearchDocumentOrmEntity> {
    return this.documents
      .createQueryBuilder('doc')
      .where(`doc.search_tsv @@ to_tsquery('simple', :tsQuery)`, { tsQuery });
  }

  private trigramBase(normalized: string): SelectQueryBuilder<ProductSearchDocumentOrmEntity> {
    return this.documents
      .createQueryBuilder('doc')
      .where(`similarity(doc.search_text, :q) > :threshold`, {
        q: normalized,
        threshold: TRIGRAM_THRESHOLD,
      });
  }

  /** Count over a scope with all active filters applied (for the result total + empty check). */
  private async countWith(
    scope: () => SelectQueryBuilder<ProductSearchDocumentOrmEntity>,
    filters: ParsedFilters,
    applicable: ResolvedFacet[],
  ): Promise<number> {
    const qb = scope();
    this.facetService.applyAll(qb, filters, applicable);
    return qb.getCount();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Expand the normalized query into matchable terms via active synonym groups (FR-SRCH-011). */
  private async expandWithSynonyms(normalized: string): Promise<string[]> {
    const tokens = normalized.split(' ').filter((t) => t !== '');
    if (tokens.length === 0) return [];
    const groups = await this.config.activeSynonymGroups();
    const expanded = new Set<string>(tokens);
    for (const token of tokens) {
      for (const group of groups) {
        if (group.includes(token)) {
          for (const term of group) expanded.add(term);
        }
      }
    }
    // tsquery-safe: keep alphanumerics/Unicode word chars; drop operators.
    return Array.from(expanded)
      .map((t) => t.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter((t) => t !== '');
  }

  private async buildZeroResultSuggestions(
    relaxedQuery: string | undefined,
    filters: ParsedFilters,
  ): Promise<ZeroResultSuggestions> {
    const popular = await this.categories.find({
      where: { isPublished: true },
      order: { position: 'ASC' },
      take: POPULAR_CATEGORIES_LIMIT,
    });
    // Restricting filters = the active facet selections that narrowed the result to zero (FR-SRCH-061).
    const restricting = Array.from(filters.terms.keys());
    if (filters.priceMin !== undefined || filters.priceMax !== undefined) restricting.push('price');
    if (filters.inStockOnly) restricting.push('in_stock');
    if (filters.onSaleOnly) restricting.push('on_sale');
    return {
      ...(relaxedQuery ? { relaxed_query: relaxedQuery } : {}),
      restricting_filters: restricting,
      popular_categories: popular.map((c) => ({ slug: c.slug, title: c.name })),
    };
  }

  private async safeLog(
    queryText: string,
    normalized: string,
    resultCount: number,
    customerId?: string | null,
  ): Promise<void> {
    try {
      await this.queryLog.log({ queryText, normalizedText: normalized, resultCount, customerId });
    } catch {
      // logging must never break the query path (§14 resilience).
    }
  }
}
