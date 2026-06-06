/** Search/listing scope discriminator (contract: data.scope.type). */
export enum SearchScopeType {
  CATEGORY = 'category',
  SEARCH = 'search',
}

/** Sort keys (FR-SRCH-040). `relevance` is valid only with a keyword query (BR-SRCH-5). */
export enum SortKey {
  RELEVANCE = 'relevance',
  NEWEST = 'newest',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  BEST_SELLING = 'best_selling',
  DISCOUNT = 'discount',
}

/** Availability mirrored from INV into the index (SRS 11 stock status). */
export enum SearchAvailability {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

/** Redirect target kinds (SRS 03 §8 SearchRedirect.target_type). */
export enum RedirectTargetType {
  CATEGORY = 'category',
  PRODUCT = 'product',
  URL = 'url',
}

/** Insights aggregation kinds (contract: GET /admin/search/insights ?type). */
export enum InsightsType {
  POPULAR = 'popular',
  ZERO_RESULTS = 'zero_results',
}

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 60;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 120;
