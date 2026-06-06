import { ApiProperty } from '@nestjs/swagger';

/** Storefront product card (Swagger doc of the contract data.products[] shape). */
export class ProductCardDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ nullable: true }) brand: string | null;
  @ApiProperty({ nullable: true }) primary_image: string | null;
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

/** Category listing payload (contract: GET /listings/category/{slug}). */
export class CategoryListingDto {
  @ApiProperty({ type: CategoryScopeDto }) scope: CategoryScopeDto;
  @ApiProperty({ type: [ProductCardDto] }) products: ProductCardDto[];
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
