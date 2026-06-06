import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { PagesService, PublicPage } from '../../application/services/pages.service';
import { PublicPageDto } from '../dto/page.dto';

/**
 * Public storefront content reads (FR-CMS-061). Page-by-slug returns published, non-deleted pages only;
 * `404` for draft/missing/deleted. Unauthenticated. The homepage payload is added by cms-merchandising-be.
 */
@ApiTags('Content — Storefront')
@Controller('content')
export class ContentPublicController {
  constructor(private readonly pages: PagesService) {}

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a published static page by slug' })
  @ApiParam({ name: 'slug', example: 'exchange-policy' })
  @ApiOkResponse({ type: PublicPageDto })
  @ApiNotFoundResponse({ description: 'Page missing, draft, or deleted' })
  getPage(@Param('slug') slug: string): Promise<PublicPage> {
    return this.pages.getPublishedBySlug(slug);
  }
}
