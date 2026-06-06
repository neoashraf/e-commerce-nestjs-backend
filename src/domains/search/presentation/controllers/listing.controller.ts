import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CategoryListingResult, ListingService } from '../../application/services/listing.service';
import { CategoryListingDto } from '../dto/listing-response.dto';

/**
 * Public category browse (FR-SRCH-001–005). `@Query()` is read as a raw record (NOT a whitelisted DTO)
 * so unknown/malformed params are ignored, not rejected (FR-SRCH-051) — sanitization is in the service.
 */
@ApiTags('Search — Storefront')
@Controller('listings')
export class ListingController {
  constructor(private readonly listing: ListingService) {}

  @Get('category/:categorySlug')
  @ApiOperation({ summary: 'Browse a category listing (published products incl. descendants)' })
  @ApiParam({ name: 'categorySlug', example: 'football-boots' })
  @ApiOkResponse({ type: CategoryListingDto })
  @ApiNotFoundResponse({ description: 'Category slug not found or unpublished' })
  browseCategory(
    @Param('categorySlug') categorySlug: string,
    @Query() query: Record<string, string | string[]>,
  ): Promise<CategoryListingResult> {
    return this.listing.browseCategory(categorySlug, query);
  }
}
