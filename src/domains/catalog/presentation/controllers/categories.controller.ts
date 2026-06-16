import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { DisplayMode } from '../../domain/enums/display-mode.enum';
import {
  AdminCategoryNode,
  GetAdminCategoryTreeUseCase,
} from '../../application/use-cases/get-admin-category-tree.use-case';
import { CreateCategoryUseCase } from '../../application/use-cases/create-category.use-case';
import { DeleteCategoryUseCase } from '../../application/use-cases/delete-category.use-case';
import { GetCategoryUseCase } from '../../application/use-cases/get-category.use-case';
import { UpdateCategoryUseCase } from '../../application/use-cases/update-category.use-case';
import { AdminCategoryTreeQueryDto } from '../dto/admin-category-tree-query.dto';
import {
  AdminCategoryTreeResponseDto,
  CreateCategoryResponseDto,
  UpdateCategoryResponseDto,
} from '../dto/category-response.dto';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { SetSizeGuideDto } from '../dto/set-size-guide.dto';
import { SizeGuideService } from '../../application/services/size-guide.service';

/** Admin CRUD for categories (SRS 02 §5.1; contract: Admin — Categories). */
@ApiTags('Catalog — Categories')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/categories')
export class CategoriesController {
  constructor(
    private readonly adminTree: GetAdminCategoryTreeUseCase,
    private readonly getCategory: GetCategoryUseCase,
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
    private readonly deleteCategory: DeleteCategoryUseCase,
    private readonly sizeGuides: SizeGuideService,
  ) {}

  @Get()
  @Requires('catalog.category.read')
  @ApiOperation({ summary: 'Get the full admin category tree (drafts + unpublished)' })
  @ApiOkResponse({ type: AdminCategoryTreeResponseDto })
  async tree(@Query() query: AdminCategoryTreeQueryDto): Promise<AdminCategoryNode[]> {
    return this.adminTree.execute(query.include_deleted ?? false);
  }

  @Get(':id')
  @Requires('catalog.category.read')
  @ApiOperation({ summary: 'Get one category (full detail for the editor)' })
  @ApiOkResponse({ description: 'Full category node' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminCategoryNode> {
    const c = await this.getCategory.execute(id);
    return {
      id: c.id,
      parent_id: c.parentId,
      name: c.name,
      slug: c.slug,
      level: c.level,
      position: c.position,
      is_published: c.isPublished,
      show_in_menu: c.showInMenu,
      display_mode: c.displayMode,
      description: c.description,
      image_url: c.imageUrl,
      logo_url: c.logoUrl,
      banner_url: c.bannerUrl,
      meta_title: c.metaTitle,
      meta_keywords: c.metaKeywords,
      meta_description: c.metaDescription,
      filterable_attribute_codes: c.filterableAttributes.map((f) => f.code),
      is_deleted: c.deletedAt !== null,
      children: [],
    };
  }

  @Post()
  @Requires('catalog.category.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ type: CreateCategoryResponseDto })
  @ApiBadRequestResponse({ description: 'Short name / depth > 3 / unknown filterable codes' })
  @ApiNotFoundResponse({ description: 'parent_id not found' })
  async create(
    @Body() dto: CreateCategoryDto,
  ): Promise<{ id: string; slug: string; level: number; is_published: boolean }> {
    const created = await this.createCategory.execute({
      name: dto.name,
      parentId: dto.parent_id ?? null,
      description: dto.description ?? null,
      displayMode: dto.display_mode ?? DisplayMode.PRODUCTS_AND_DESCRIPTION,
      showInMenu: dto.show_in_menu ?? true,
      imageUrl: dto.image_url ?? null,
      logoUrl: dto.logo_url ?? null,
      bannerUrl: dto.banner_url ?? null,
      filterableAttributeCodes: dto.filterable_attribute_codes ?? [],
      metaTitle: dto.meta_title ?? null,
      metaKeywords: dto.meta_keywords ?? null,
      metaDescription: dto.meta_description ?? null,
    });
    return {
      id: created.id,
      slug: created.slug,
      level: created.level,
      is_published: created.isPublished,
    };
  }

  @Patch(':id')
  @Requires('catalog.category.update')
  @ApiOperation({ summary: 'Update / reorder / publish a category' })
  @ApiOkResponse({ type: UpdateCategoryResponseDto })
  @ApiBadRequestResponse({ description: 'Depth > 3 / invalid parent / unknown filterable codes' })
  @ApiNotFoundResponse({ description: 'Category or parent not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<{ id: string; is_published: boolean }> {
    const updated = await this.updateCategory.execute({
      id,
      name: dto.name,
      parentId: dto.parent_id,
      description: dto.description,
      displayMode: dto.display_mode,
      position: dto.position,
      isPublished: dto.is_published,
      showInMenu: dto.show_in_menu,
      imageUrl: dto.image_url,
      logoUrl: dto.logo_url,
      bannerUrl: dto.banner_url,
      filterableAttributeCodes: dto.filterable_attribute_codes,
      metaTitle: dto.meta_title,
      metaKeywords: dto.meta_keywords,
      metaDescription: dto.meta_description,
    });
    return { id: updated.id, is_published: updated.isPublished };
  }

  @Delete(':id')
  @Requires('catalog.category.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a category' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'CATEGORY_HAS_DEPENDENTS (child categories / products)' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteCategory.execute(id);
  }

  @Put(':id/size-guide')
  @Requires('catalog.category.update')
  @ApiOperation({ summary: 'Set or clear a category footwear size guide (RW6)' })
  @ApiOkResponse({ description: 'Set/cleared; { data: { category_id, rows } }' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async setSizeGuide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSizeGuideDto,
  ): Promise<{ category_id: string; rows: number }> {
    if (dto.size_guide) {
      const rows = await this.sizeGuides.set(id, {
        measure_note: dto.size_guide.measure_note,
        unit: dto.size_guide.unit,
        rows: dto.size_guide.rows,
      });
      return { category_id: id, rows };
    }
    await this.sizeGuides.clear(id);
    return { category_id: id, rows: 0 };
  }
}
