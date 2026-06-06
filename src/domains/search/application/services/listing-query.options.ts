import { SelectQueryBuilder } from 'typeorm';

import { ProductSearchDocumentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  SearchAvailability,
  SortKey,
} from '../../domain/search-enums';

/** Parsed, sanitized listing/search query options shared by the listing + search services. */
export interface ListingOptions {
  page: number;
  limit: number;
  sort: SortKey;
}

/** Coerce a raw param to a positive integer, else the fallback (FR-SRCH-051: ignore malformed). */
function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/**
 * Parse + sanitize page/limit/sort from raw query params (FR-SRCH-041/043/051; §11). `limit` defaults to
 * 24 and caps at 60; `page` defaults to 1; an unknown/invalid `sort` falls back to the caller's default;
 * `relevance` is only honored when a keyword query is present (BR-SRCH-5) — the caller passes
 * `allowRelevance`. Never throws on bad params; malformed values are ignored.
 */
export function parseListingOptions(
  raw: { page?: unknown; limit?: unknown; sort?: unknown },
  defaultSort: SortKey,
  allowRelevance: boolean,
): ListingOptions {
  const page = toPositiveInt(raw.page, 1);
  const limit = Math.min(toPositiveInt(raw.limit, DEFAULT_LIMIT), MAX_LIMIT);

  let sort = defaultSort;
  const candidate = typeof raw.sort === 'string' ? (raw.sort as SortKey) : undefined;
  if (candidate && Object.values(SortKey).includes(candidate)) {
    // `relevance` without a query is rejected → fall back to the default (§11).
    if (candidate === SortKey.RELEVANCE && !allowRelevance) {
      sort = defaultSort;
    } else {
      sort = candidate;
    }
  }
  return { page, limit, sort };
}

/**
 * Apply sort + the OOS-last rule + a deterministic tie-break to a document query (FR-SRCH-005/040/042,
 * BR-SRCH-8). Out-of-stock rows are always ordered after in-stock within the chosen sort via a leading
 * availability rank; `product_id` is the stable final tie-break so pages never duplicate/skip. For
 * `relevance` the caller must have added a `rank` select alias before calling this.
 */
export function applySortAndPaging(
  qb: SelectQueryBuilder<ProductSearchDocumentOrmEntity>,
  options: ListingOptions,
  hasRelevanceRank: boolean,
): void {
  // OOS last: in_stock/low_stock (available) before out_of_stock.
  qb.addSelect(
    `CASE WHEN doc.availability = '${SearchAvailability.OUT_OF_STOCK}' THEN 1 ELSE 0 END`,
    'oos_rank',
  ).orderBy('oos_rank', 'ASC');

  switch (options.sort) {
    case SortKey.RELEVANCE:
      if (hasRelevanceRank) qb.addOrderBy('rank', 'DESC');
      break;
    case SortKey.PRICE_ASC:
      qb.addOrderBy('doc.effective_price', 'ASC');
      break;
    case SortKey.PRICE_DESC:
      qb.addOrderBy('doc.effective_price', 'DESC');
      break;
    case SortKey.DISCOUNT:
      // Largest absolute discount first; non-sale products sort to the end of this key.
      qb.addOrderBy('(doc.base_price - doc.effective_price)', 'DESC');
      break;
    case SortKey.BEST_SELLING:
      // best_selling falls back to newest until order data exists (SRS §15).
      qb.addOrderBy('doc.best_selling_score', 'DESC').addOrderBy('doc.published_at', 'DESC');
      break;
    case SortKey.NEWEST:
    default:
      qb.addOrderBy('doc.published_at', 'DESC');
      break;
  }

  // Deterministic stable tie-break (BR-SRCH-8, FR-SRCH-042).
  qb.addOrderBy('doc.product_id', 'ASC');

  qb.offset((options.page - 1) * options.limit).limit(options.limit);
}
