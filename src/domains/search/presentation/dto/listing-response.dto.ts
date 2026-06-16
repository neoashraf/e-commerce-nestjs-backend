import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A single colourway on the card swatch rail (RW6). */
export class ProductCardSwatchDto {
  @ApiProperty({ example: 'https://…/black-thumb.webp', description: 'Colourway thumbnail (listing rendition or image swatch).' })
  image: string;
  @ApiProperty({ example: 'Black' }) label: string;
  @ApiProperty({ nullable: true, example: '#000000', description: 'Hex when the option is a colour swatch, else null.' })
  color_hex: string | null;
}

/** Storefront product card (Swagger doc of the contract data.products[] shape). */
export class ProductCardDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true, description: 'Optional Bangla product name (RW6).' })
  name_bn: string | null;
  @ApiProperty({ nullable: true }) brand: string | null;
  @ApiProperty({ nullable: true }) primary_image: string | null;
  @ApiProperty({ nullable: true, description: 'Second listing image for the desktop hover cross-fade (RW6); null → zoom fallback.' })
  hover_image: string | null;
  @ApiProperty({ type: [ProductCardSwatchDto], description: 'Colourways flattened from the color attribute (≤6); [] → no rail (RW6).' })
  swatches: ProductCardSwatchDto[];
  @ApiProperty({ description: 'true → "Choose size" (configurable); false → "Add to bag" (simple) (RW6).' })
  requires_variant: boolean;
  @ApiProperty({ nullable: true, enum: ['new', 'bestSeller', 'authentic'], description: 'Light merch label; new from is_new, bestSeller/authentic null until source data exists (RW6).' })
  merch_label: 'new' | 'bestSeller' | 'authentic' | null;
  @ApiProperty({ example: '12500.00' }) effective_price: string;
  @ApiProperty({ example: '14000.00' }) base_price: string;
  @ApiProperty() on_sale: boolean;
  @ApiProperty({ example: 'BDT' }) currency: string;
  @ApiProperty({ example: 'in_stock' }) availability: string;
}

class CategoryScopeDto {
  @ApiProperty({ example: 'category' }) type: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ type: [String] }) breadcrumb: string[];
}

class FacetValueDto {
  @ApiProperty({ example: 'fg' }) value: string;
  @ApiProperty({ example: 'Firm Ground' }) label: string;
  @ApiProperty({ example: 18 }) count: number;
  @ApiPropertyOptional({ example: '#000000' }) color_hex?: string;
}

class FacetBlockDto {
  @ApiProperty({ example: 'surface' }) key: string;
  @ApiProperty({ example: 'Surface' }) label: string;
  @ApiProperty({ example: 'term', description: 'term | range | boolean' }) type: string;
  @ApiPropertyOptional({ example: true }) multi_select?: boolean;
  @ApiPropertyOptional({ type: [FacetValueDto] }) values?: FacetValueDto[];
  @ApiPropertyOptional({ example: '1500.00' }) min?: string;
  @ApiPropertyOptional({ example: '24000.00' }) max?: string;
  @ApiPropertyOptional({ example: 12 }) count?: number;
}

/** Category listing payload (contract: GET /listings/category/{slug}). */
export class CategoryListingDto {
  @ApiProperty({ type: CategoryScopeDto }) scope: CategoryScopeDto;
  @ApiProperty({ type: [ProductCardDto] }) products: ProductCardDto[];
  @ApiProperty({ type: [FacetBlockDto] }) facets: FacetBlockDto[];
  @ApiProperty({ type: Object }) applied_filters: Record<string, unknown>;
  @ApiProperty({ example: 'best_selling' }) sort: string;
}

class SearchScopeDto {
  @ApiProperty({ example: 'search' }) type: string;
  @ApiProperty() query: string;
  @ApiProperty({ required: false }) normalized?: string;
}

class RedirectDto {
  @ApiProperty({ example: 'category' }) target_type: string;
  @ApiProperty({ example: 'predator-collection' }) target_ref: string;
}

class CategoryRefDto {
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
}

class ZeroResultSuggestionsDto {
  @ApiProperty({ required: false }) relaxed_query?: string;
  @ApiProperty({ type: [String] }) restricting_filters: string[];
  @ApiProperty({ type: [CategoryRefDto] }) popular_categories: CategoryRefDto[];
}

/** Keyword-search payload (contract: GET /search — results / redirect / zero-result variants). */
export class SearchResponseDto {
  @ApiProperty({ type: SearchScopeDto }) scope: SearchScopeDto;
  @ApiProperty({ type: RedirectDto, nullable: true }) redirect: RedirectDto | null;
  @ApiProperty({ type: [ProductCardDto] }) products: ProductCardDto[];
  @ApiProperty({ type: [FacetBlockDto] }) facets: FacetBlockDto[];
  @ApiProperty({ type: Object }) applied_filters: Record<string, unknown>;
  @ApiProperty({ example: 'relevance' }) sort: string;
  @ApiProperty({ type: ZeroResultSuggestionsDto, nullable: true })
  suggestions: ZeroResultSuggestionsDto | null;
}

class ProductSuggestionDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true }) primary_image: string | null;
  @ApiProperty({ example: '12500.00' }) effective_price: string;
}

/** Autosuggest payload (contract: GET /search/suggest). */
export class SuggestResponseDto {
  @ApiProperty({ type: [String] }) query_suggestions: string[];
  @ApiProperty({ type: [CategoryRefDto] }) category_suggestions: CategoryRefDto[];
  @ApiProperty({ type: [ProductSuggestionDto] }) product_suggestions: ProductSuggestionDto[];
}
