import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { MIN_QUERY_LENGTH } from '../../domain/search-enums';
import { normalizeQuery } from '../../domain/query-normalize';

const PRODUCT_SUGGESTION_LIMIT = 6;
const CATEGORY_SUGGESTION_LIMIT = 5;
const QUERY_SUGGESTION_LIMIT = 6;

export interface SuggestResult {
  query_suggestions: string[];
  category_suggestions: { slug: string; title: string }[];
  product_suggestions: {
    id: string;
    slug: string;
    title: string;
    primary_image: string | null;
    effective_price: string;
  }[];
}

/**
 * Autosuggest / typeahead (FR-SRCH-020/021/022). Returns query completions (from matching product
 * titles), category suggestions, and a few top product cards — all from the index (low-latency, §14).
 * Below the minimum query length (2) it returns empty arrays gracefully (FR-SRCH-022).
 */
@Injectable()
export class SuggestService {
  constructor(
    @InjectRepository(ProductSearchDocumentOrmEntity)
    private readonly documents: Repository<ProductSearchDocumentOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
  ) {}

  async suggest(rawQuery: string): Promise<SuggestResult> {
    const normalized = normalizeQuery(rawQuery);
    if (normalized.length < MIN_QUERY_LENGTH) {
      return { query_suggestions: [], category_suggestions: [], product_suggestions: [] };
    }

    const [productMatches, categoryMatches] = await Promise.all([
      this.documents
        .createQueryBuilder('doc')
        .where('doc.search_text ILIKE :q', { q: `%${normalized}%` })
        .orderBy('doc.best_selling_score', 'DESC')
        .addOrderBy('doc.published_at', 'DESC')
        .take(PRODUCT_SUGGESTION_LIMIT)
        .getMany(),
      this.categories.find({
        where: { name: ILike(`%${normalized}%`), isPublished: true },
        take: CATEGORY_SUGGESTION_LIMIT,
      }),
    ]);

    const querySuggestions = Array.from(new Set(productMatches.map((p) => p.title.toLowerCase()))).slice(
      0,
      QUERY_SUGGESTION_LIMIT,
    );

    return {
      query_suggestions: querySuggestions,
      category_suggestions: categoryMatches.map((c) => ({ slug: c.slug, title: c.name })),
      product_suggestions: productMatches.map((p) => ({
        id: p.productId,
        slug: p.slug,
        title: p.title,
        primary_image: p.primaryImage,
        effective_price: Number(p.effectivePrice).toFixed(2),
      })),
    };
  }
}
