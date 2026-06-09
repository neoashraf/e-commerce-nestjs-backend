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

import { SkipEnvelope } from '../../../../shared/decorators/skip-envelope.decorator';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { Attribute } from '../../domain/entities/attribute.entity';
import { CreateAttributeUseCase } from '../../application/use-cases/create-attribute.use-case';
import { DeleteAttributeUseCase } from '../../application/use-cases/delete-attribute.use-case';
import { GetAttributeUseCase } from '../../application/use-cases/get-attribute.use-case';
import { ListAttributesUseCase } from '../../application/use-cases/list-attributes.use-case';
import { UpdateAttributeUseCase } from '../../application/use-cases/update-attribute.use-case';
import {
  AttributeDetailDto,
  AttributeListResponseDto,
  AttributeRowDto,
  CreateAttributeResponseDto,
  UpdateAttributeResponseDto,
} from '../dto/attribute-response.dto';
import { CreateAttributeDto } from '../dto/create-attribute.dto';
import { ListAttributesQueryDto } from '../dto/list-attributes-query.dto';
import { UpdateAttributeDto } from '../dto/update-attribute.dto';

/** Admin CRUD for attributes (SRS 02 §5.2; contract: Admin — Attributes). */
@ApiTags('Catalog — Attributes')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/attributes')
export class AttributesController {
  constructor(
    private readonly listAttributes: ListAttributesUseCase,
    private readonly getAttribute: GetAttributeUseCase,
    private readonly createAttribute: CreateAttributeUseCase,
    private readonly updateAttribute: UpdateAttributeUseCase,
    private readonly deleteAttribute: DeleteAttributeUseCase,
  ) {}

  @Get()
  @Requires('catalog.attribute.read')
  @SkipEnvelope()
  @ApiOperation({ summary: 'List attributes (paginated, filterable)' })
  @ApiOkResponse({ type: AttributeListResponseDto })
  async list(@Query() query: ListAttributesQueryDto): Promise<AttributeListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const result = await this.listAttributes.execute({
      page,
      limit,
      type: query.type,
      filterable: query.filterable,
      isRequired: query.is_required,
      isUnique: query.is_unique,
      isUserDefined: query.is_user_defined,
      q: query.q,
    });
    return {
      data: result.items.map((a) => AttributesController.toRow(a)),
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  @Get(':id')
  @Requires('catalog.attribute.read')
  @ApiOperation({ summary: 'Get one attribute (full detail incl. options)' })
  @ApiOkResponse({ type: AttributeDetailDto })
  @ApiNotFoundResponse({ description: 'Attribute not found' })
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<AttributeDetailDto> {
    const attribute = await this.getAttribute.execute(id);
    return AttributesController.toDetail(attribute);
  }

  @Post()
  @Requires('catalog.attribute.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an attribute' })
  @ApiCreatedResponse({ type: CreateAttributeResponseDto })
  @ApiBadRequestResponse({ description: 'Bad code / configurable-on-non-select / zero options' })
  @ApiConflictResponse({ description: 'Duplicate code (ATTRIBUTE_CODE_EXISTS)' })
  async create(@Body() dto: CreateAttributeDto): Promise<{ id: string; code: string }> {
    const created = await this.createAttribute.execute({
      code: dto.code,
      adminLabel: dto.admin_label,
      type: dto.type,
      isRequired: dto.is_required,
      isUnique: dto.is_unique,
      isFilterable: dto.is_filterable,
      isConfigurable: dto.is_configurable,
      isVisibleOnFront: dto.is_visible_on_front,
      isComparable: dto.is_comparable,
      validation: dto.validation,
      defaultValue: dto.default_value,
      position: dto.position,
      options: dto.options?.map((o) => ({
        value: o.value,
        label: o.label,
        swatchType: o.swatch_type ?? null,
        swatchValue: o.swatch_value ?? null,
        position: o.position,
      })),
    });
    return { id: created.id, code: created.code };
  }

  @Patch(':id')
  @Requires('catalog.attribute.update')
  @ApiOperation({ summary: 'Update an attribute / its options' })
  @ApiOkResponse({ type: UpdateAttributeResponseDto })
  @ApiBadRequestResponse({ description: 'Immutable code / configurable-on-non-select / OPTION_IN_USE' })
  @ApiNotFoundResponse({ description: 'Attribute not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
  ): Promise<{ id: string }> {
    const updated = await this.updateAttribute.execute({
      id,
      code: dto.code,
      adminLabel: dto.admin_label,
      type: dto.type,
      isRequired: dto.is_required,
      isUnique: dto.is_unique,
      isFilterable: dto.is_filterable,
      isConfigurable: dto.is_configurable,
      isVisibleOnFront: dto.is_visible_on_front,
      isComparable: dto.is_comparable,
      isActive: dto.is_active,
      validation: dto.validation,
      defaultValue: dto.default_value,
      position: dto.position,
      options: dto.options?.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
        swatchType: o.swatch_type ?? null,
        swatchValue: o.swatch_value ?? null,
        position: o.position,
      })),
    });
    return { id: updated.id };
  }

  @Delete(':id')
  @Requires('catalog.attribute.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attribute' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'ATTRIBUTE_IN_USE or SYSTEM_ATTRIBUTE' })
  @ApiNotFoundResponse({ description: 'Attribute not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteAttribute.execute(id);
  }

  private static toRow(a: Attribute): AttributeRowDto {
    return {
      id: a.id,
      code: a.code,
      admin_label: a.adminLabel,
      type: a.type,
      is_required: a.isRequired,
      is_unique: a.isUnique,
      is_filterable: a.isFilterable,
      is_configurable: a.isConfigurable,
      is_visible_on_front: a.isVisibleOnFront,
      is_comparable: a.isComparable,
      is_user_defined: a.isUserDefined,
    };
  }

  private static toDetail(a: Attribute): AttributeDetailDto {
    return {
      ...AttributesController.toRow(a),
      validation: a.validation,
      default_value: a.defaultValue,
      position: a.position,
      is_active: a.isActive,
      options: a.options.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
        swatch_type: o.swatchType,
        swatch_value: o.swatchValue,
        position: o.position,
      })),
    };
  }
}
