import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  GetPublicCategoryTreeUseCase,
  PublicCategoryNode,
} from '../../application/use-cases/get-public-category-tree.use-case';
import { PublicCategoryTreeResponseDto } from '../dto/category-response.dto';

/** Public storefront category tree (SRS 02 §5.7; contract: Storefront — Published category tree). */
@ApiTags('Catalog — Storefront')
@Controller('categories')
export class CategoriesPublicController {
  constructor(private readonly publicTree: GetPublicCategoryTreeUseCase) {}

  @Get('tree')
  @ApiOperation({ summary: 'Published, in-menu category tree (FR-CAT-040)' })
  @ApiOkResponse({ type: PublicCategoryTreeResponseDto })
  async tree(): Promise<PublicCategoryNode[]> {
    return this.publicTree.execute();
  }
}
