import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { SearchResult, SearchService } from '../../application/services/search.service';
import { SuggestResult, SuggestService } from '../../application/services/suggest.service';
import { SearchResponseDto, SuggestResponseDto } from '../dto/listing-response.dto';

/**
 * Public keyword search + autosuggest (FR-SRCH-010–022). `@Query()` read raw so unknown/malformed params
 * are ignored, not rejected (FR-SRCH-051). Both endpoints are unauthenticated; logged-in customer id (if
 * any) would attach via a customer guard — left unauthenticated per the public contract, customer_id null.
 */
@ApiTags('Search — Storefront')
@Controller('search')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly suggest: SuggestService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Keyword search (FTS + typo tolerance + synonyms + redirect + recovery)' })
  @ApiQuery({ name: 'q', required: false, example: 'predator' })
  @ApiOkResponse({ type: SearchResponseDto })
  searchProducts(@Query() query: Record<string, string | string[]>): Promise<SearchResult> {
    const q = typeof query.q === 'string' ? query.q : '';
    return this.search.search(q, query, null);
  }

  @Get('suggest')
  @ApiOperation({ summary: 'Autosuggest / typeahead (empty arrays below min length 2)' })
  @ApiQuery({ name: 'q', required: false, example: 'pred' })
  @ApiOkResponse({ type: SuggestResponseDto })
  suggestProducts(@Query() query: Record<string, string | string[]>): Promise<SuggestResult> {
    const q = typeof query.q === 'string' ? query.q : '';
    return this.suggest.suggest(q);
  }
}
