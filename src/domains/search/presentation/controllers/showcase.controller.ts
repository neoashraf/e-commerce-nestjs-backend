import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { ProductCard, ShowcaseService } from '../../application/services/showcase.service';
import { ProductCardDto } from '../dto/listing-response.dto';
import { ShowcasePageQueryDto } from '../dto/showcase-query.dto';

/**
 * Storefront product showcases for the home page (public, unauthenticated):
 *  - GET /featured-products      — all featured products, paginated (20/page)
 *  - GET /new-products           — the latest 20 published products
 *  - GET /best-selling-products  — the top 20 products by units sold
 * Distinct top-level paths (not under /products) so they never collide with GET /products/{slug}.
 */
@ApiTags('Catalog — Storefront')
@Controller()
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get('featured-products')
  @ApiOperation({ summary: 'List featured products (paginated, default 20/page)' })
  @ApiOkResponse({ type: ProductCardDto, isArray: true })
  async featured(@Query() query: ShowcasePageQueryDto): Promise<Paginated<ProductCard>> {
    return this.showcase.featured(query.page ?? 1, query.limit ?? 20);
  }

  @Get('new-products')
  @ApiOperation({ summary: 'List the latest 20 newly published products' })
  @ApiOkResponse({ type: ProductCardDto, isArray: true })
  async newArrivals(): Promise<ProductCard[]> {
    return this.showcase.newArrivals();
  }

  @Get('best-selling-products')
  @ApiOperation({ summary: 'List the top 20 best-selling products (by units sold)' })
  @ApiOkResponse({ type: ProductCardDto, isArray: true })
  async bestSelling(): Promise<ProductCard[]> {
    return this.showcase.bestSelling();
  }
}
