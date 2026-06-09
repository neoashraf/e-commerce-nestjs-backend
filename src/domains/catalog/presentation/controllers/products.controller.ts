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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  AdminProductDetail,
  AdminProductRow,
  ProductsService,
} from '../../application/services/products.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import {
  AdminProductDetailDto,
  AdminProductRowDto,
  CreateProductResponseDto,
  SetProductLinksResponseDto,
  UpdateProductResponseDto,
  UpdateStatusResponseDto,
} from '../dto/product-response.dto';
import { SetProductLinksDto } from '../dto/set-product-links.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { UpdateStatusDto } from '../dto/update-status.dto';

/** Admin CRUD + lifecycle for products (SRS 02 §5.4; contract: Admin — Products). */
@ApiTags('Catalog — Products')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @Requires('catalog.product.read')
  @ApiOperation({ summary: 'List products (paginated; filter status/type/family/category + search q)' })
  @ApiOkResponse({ type: AdminProductRowDto, isArray: true })
  async list(@Query() query: ListProductsQueryDto): Promise<Paginated<AdminProductRow>> {
    return this.products.list({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      type: query.type,
      family: query.family,
      category: query.category,
      q: query.q,
    });
  }

  @Get(':id')
  @Requires('catalog.product.read')
  @ApiOperation({ summary: 'Get one product in full detail (editor prefill; includes updated_at)' })
  @ApiOkResponse({ type: AdminProductDetailDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<AdminProductDetail> {
    return this.products.getAdminDetail(id);
  }

  @Post()
  @Requires('catalog.product.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft product (with EAV attribute values)' })
  @ApiCreatedResponse({ type: CreateProductResponseDto })
  @ApiBadRequestResponse({ description: 'sale_price≥base / invalid attribute value / bad field' })
  @ApiNotFoundResponse({ description: 'family_id / primary_category_id not found' })
  @ApiConflictResponse({ description: 'SKU/slug conflict' })
  async create(
    @Body() dto: CreateProductDto,
  ): Promise<{ id: string; slug: string; type: string; status: string }> {
    return this.products.create({
      type: dto.type,
      familyId: dto.family_id,
      sku: dto.sku,
      name: dto.name,
      primaryCategoryId: dto.primary_category_id,
      categoryIds: dto.category_ids,
      brand: dto.brand,
      shortDescription: dto.short_description,
      description: dto.description,
      basePrice: dto.base_price,
      salePrice: dto.sale_price,
      saleStartsAt: dto.sale_starts_at,
      saleEndsAt: dto.sale_ends_at,
      isFeatured: dto.is_featured,
      isNew: dto.is_new,
      weight: dto.weight,
      attributes: dto.attributes,
      metaTitle: dto.meta_title,
      metaKeywords: dto.meta_keywords,
      metaDescription: dto.meta_description,
    });
  }

  @Patch(':id')
  @Requires('catalog.product.update')
  @ApiOperation({ summary: 'Update a product (family_id immutable; optimistic concurrency)' })
  @ApiOkResponse({ type: UpdateProductResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid sale window / attribute value' })
  @ApiNotFoundResponse({ description: 'Product / category not found' })
  @ApiConflictResponse({ description: 'STALE_WRITE' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<{ id: string }> {
    return this.products.update({
      id,
      updatedAt: dto.updated_at,
      name: dto.name,
      primaryCategoryId: dto.primary_category_id,
      categoryIds: dto.category_ids,
      brand: dto.brand,
      shortDescription: dto.short_description,
      description: dto.description,
      basePrice: dto.base_price,
      salePrice: dto.sale_price,
      saleStartsAt: dto.sale_starts_at,
      saleEndsAt: dto.sale_ends_at,
      isFeatured: dto.is_featured,
      isNew: dto.is_new,
      weight: dto.weight,
      attributes: dto.attributes,
      metaTitle: dto.meta_title,
      metaKeywords: dto.meta_keywords,
      metaDescription: dto.meta_description,
    });
  }

  @Put(':id/links')
  @Requires('catalog.product.update')
  @ApiOperation({ summary: 'Replace related / up-sell / cross-sell links (self excluded)' })
  @ApiOkResponse({ type: SetProductLinksResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown link target' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async setLinks(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProductLinksDto,
  ): Promise<{ related: number; up_sell: number; cross_sell: number }> {
    return this.products.setLinks(id, dto.related ?? [], dto.up_sell ?? [], dto.cross_sell ?? []);
  }

  @Patch(':id/status')
  @Requires('catalog.product.update')
  @ApiOperation({ summary: 'Publish / archive a product (publish runs the publish trinity)' })
  @ApiOkResponse({ type: UpdateStatusResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'NOT_PUBLISHABLE with details[]' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<{ id: string; status: string }> {
    return this.products.setStatus(id, dto.status);
  }

  @Delete(':id')
  @Requires('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product (blocked when referenced by an order)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'PRODUCT_IN_ORDER (archive instead)' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.products.softDelete(id);
  }
}
