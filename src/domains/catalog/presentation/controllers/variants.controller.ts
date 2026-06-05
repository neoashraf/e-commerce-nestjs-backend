import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { VariantsService } from '../../application/services/variants.service';
import { GenerateVariantsDto } from '../dto/generate-variants.dto';
import { UpdateVariantDto } from '../dto/update-variant.dto';
import {
  GenerateVariantsResponseDto,
  UpdateVariantResponseDto,
} from '../dto/variant-response.dto';

/**
 * Admin configurable-variant operations (SRS 02 §5.5; contract: POST /admin/products/{id}/variants
 * + PATCH /admin/variants/{id}). Both gated by `catalog.product.update` (variant ops are product
 * editing — confirm with RBAC).
 */
@ApiTags('Catalog — Variants')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin')
export class VariantsController {
  constructor(private readonly variants: VariantsService) {}

  @Post('products/:id/variants')
  @Requires('catalog.product.update')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Set configurable attributes & generate the variant matrix (append-only)' })
  @ApiCreatedResponse({ type: GenerateVariantsResponseDto })
  @ApiBadRequestResponse({ description: 'Zero/non-configurable/non-select attr or empty option set' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiConflictResponse({ description: 'Generated SKU collides with an existing SKU' })
  async generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateVariantsDto,
  ): Promise<{ variants_created: number; variants: unknown[] }> {
    return this.variants.generate(
      id,
      dto.configurable_attributes.map((a) => ({ code: a.code, optionIds: a.option_ids })),
    );
  }

  @Patch('variants/:id')
  @Requires('catalog.product.update')
  @ApiOperation({ summary: 'Update a variant (sku_code / price_override / image_id / is_enabled)' })
  @ApiOkResponse({ type: UpdateVariantResponseDto })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  @ApiConflictResponse({ description: 'sku_code not unique / OPTION_IN_USE' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<{ id: string }> {
    return this.variants.update({
      id,
      skuCode: dto.sku_code,
      priceOverride: dto.price_override,
      imageId: dto.image_id,
      isEnabled: dto.is_enabled,
    });
  }
}
