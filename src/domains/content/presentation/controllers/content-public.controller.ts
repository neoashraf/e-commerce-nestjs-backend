import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { HomepagePayload, HomepageService } from '../../application/services/homepage.service';
import { PagesService, PublicPage } from '../../application/services/pages.service';
import { PublicPageDto } from '../dto/page.dto';

/**
 * Public storefront content reads (FR-CMS-060/061). The homepage payload aggregates live
 * slider/banners/sections + menus + SEO; page-by-slug returns published, non-deleted pages only
 * (`404` otherwise). Unauthenticated.
 */
@ApiTags('Content — Storefront')
@Controller('content')
export class ContentPublicController {
  constructor(
    private readonly pages: PagesService,
    private readonly homepage: HomepageService,
  ) {}

  @Get('homepage')
  @ApiOperation({ summary: 'Homepage content payload (live slider/banners/sections + menus + SEO)' })
  @ApiOkResponse({ description: 'Homepage payload' })
  getHomepage(): Promise<HomepagePayload> {
    return this.homepage.getHomepage();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a published static page by slug' })
  @ApiParam({ name: 'slug', example: 'exchange-policy' })
  @ApiOkResponse({ type: PublicPageDto })
  @ApiNotFoundResponse({ description: 'Page missing, draft, or deleted' })
  getPage(@Param('slug') slug: string): Promise<PublicPage> {
    return this.pages.getPublishedBySlug(slug);
  }
}
