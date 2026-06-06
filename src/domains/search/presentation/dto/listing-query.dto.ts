import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Listing/search query params. Intentionally permissive (NOT whitelisted-validated) because SRCH must
 * **ignore unknown/malformed params** rather than error (FR-SRCH-051, §12.11); parsing + sanitization
 * happen in the services. Documented here only for Swagger. Facet params (color, size, brand, price
 * range, …) are read raw by the facets sibling.
 */
export class ListingQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page (≥1; default 1; out-of-range → empty page)' })
  page?: string;

  @ApiPropertyOptional({ example: 24, description: 'Page size (default 24, max 60)' })
  limit?: string;

  @ApiPropertyOptional({
    example: 'price_asc',
    description: 'relevance(search-only)|newest|price_asc|price_desc|best_selling|discount',
  })
  sort?: string;
}

/** Keyword-search query params (adds `q`). */
export class SearchQueryDto extends ListingQueryDto {
  @ApiPropertyOptional({ example: 'predator', description: 'Free-text query (trimmed; max 120 chars)' })
  q?: string;
}

/** Autosuggest query param. */
export class SuggestQueryDto {
  @ApiPropertyOptional({ example: 'pred', description: 'Partial query (min 2 chars or empty arrays)' })
  q?: string;
}
