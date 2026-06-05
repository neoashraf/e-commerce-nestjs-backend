import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ProductDetailService } from '../../application/services/product-detail.service';
import { ProductDetailResponseDto } from '../dto/product-detail.response';

/**
 * Public storefront product detail (SRS 02 §5.7; contract: Storefront → GET — Product detail).
 * Unauthenticated, no permission guard. Returns the full PDP payload or `404` for any non-published
 * slug (draft/archived/soft-deleted/unknown).
 */
@ApiTags('Catalog — Storefront')
@Controller('products')
export class ProductDetailController {
  constructor(private readonly detail: ProductDetailService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published product detail by slug (live stock + effective price)' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Slug not found / draft / archived / soft-deleted' })
  async getBySlug(@Param('slug') slug: string): Promise<ProductDetailResponseDto> {
    return this.detail.getBySlug(slug);
  }
}
