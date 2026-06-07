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
import { AttributeFamily } from '../../domain/entities/attribute-family.entity';
import { CreateAttributeFamilyUseCase } from '../../application/use-cases/create-attribute-family.use-case';
import { DeleteAttributeFamilyUseCase } from '../../application/use-cases/delete-attribute-family.use-case';
import { GetAttributeFamilyUseCase } from '../../application/use-cases/get-attribute-family.use-case';
import { ListAttributeFamiliesUseCase } from '../../application/use-cases/list-attribute-families.use-case';
import { UpdateAttributeFamilyUseCase } from '../../application/use-cases/update-attribute-family.use-case';
import { CreateAttributeFamilyDto } from '../dto/create-attribute-family.dto';
import {
  AttributeFamilyDetailDto,
  AttributeFamilyDetailResponseDto,
  AttributeFamilyListResponseDto,
  AttributeFamilyRowDto,
  CreateAttributeFamilyResponseDto,
  UpdateAttributeFamilyResponseDto,
} from '../dto/attribute-family-response.dto';
import { UpdateAttributeFamilyDto } from '../dto/update-attribute-family.dto';

/** Admin CRUD for attribute families (SRS 02 §5.3; contract: Admin — Attribute Families). */
@ApiTags('Catalog — Attribute Families')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/attribute-families')
export class AttributeFamiliesController {
  constructor(
    private readonly listFamilies: ListAttributeFamiliesUseCase,
    private readonly getFamily: GetAttributeFamilyUseCase,
    private readonly createFamily: CreateAttributeFamilyUseCase,
    private readonly updateFamily: UpdateAttributeFamilyUseCase,
    private readonly deleteFamily: DeleteAttributeFamilyUseCase,
  ) {}

  @Get()
  @Requires('catalog.attribute_family.read')
  @ApiOperation({ summary: 'List attribute families' })
  @ApiOkResponse({ type: AttributeFamilyListResponseDto })
  async list(): Promise<AttributeFamilyRowDto[]> {
    const families = await this.listFamilies.execute();
    return families.map((f) => ({
      id: f.id,
      code: f.code,
      name: f.name,
      is_default: f.isDefault,
    }));
  }

  @Get(':id')
  @Requires('catalog.attribute_family.read')
  @ApiOperation({ summary: 'Get a family with its ordered groups and attributes' })
  @ApiOkResponse({ type: AttributeFamilyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Family not found' })
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<AttributeFamilyDetailDto> {
    const family = await this.getFamily.execute(id);
    return AttributeFamiliesController.toDetail(family);
  }

  @Post()
  @Requires('catalog.attribute_family.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an attribute family' })
  @ApiCreatedResponse({ type: CreateAttributeFamilyResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid code / unknown attribute / missing mandatory attribute' })
  @ApiConflictResponse({ description: 'Duplicate code (FAMILY_CODE_EXISTS)' })
  async create(@Body() dto: CreateAttributeFamilyDto): Promise<{ id: string; code: string }> {
    const created = await this.createFamily.execute({
      code: dto.code,
      name: dto.name,
      groups: dto.groups.map((g) => ({
        name: g.name,
        column: g.column,
        position: g.position,
        attributeCodes: g.attribute_codes,
      })),
    });
    return { id: created.id, code: created.code };
  }

  @Patch(':id')
  @Requires('catalog.attribute_family.update')
  @ApiOperation({ summary: 'Update a family (full-replace grouping; code immutable)' })
  @ApiOkResponse({ type: UpdateAttributeFamilyResponseDto })
  @ApiBadRequestResponse({ description: 'Unknown attribute / missing mandatory attribute' })
  @ApiNotFoundResponse({ description: 'Family not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeFamilyDto,
  ): Promise<{ id: string }> {
    // `dto.code` is intentionally ignored — family code is immutable (FR-CAT-061).
    const updated = await this.updateFamily.execute({
      id,
      name: dto.name,
      groups: dto.groups.map((g) => ({
        name: g.name,
        column: g.column,
        position: g.position,
        attributeCodes: g.attribute_codes,
      })),
    });
    return { id: updated.id };
  }

  @Delete(':id')
  @Requires('catalog.attribute_family.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an attribute family' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'DEFAULT_FAMILY or FAMILY_IN_USE' })
  @ApiNotFoundResponse({ description: 'Family not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteFamily.execute(id);
  }

  private static toDetail(f: AttributeFamily): AttributeFamilyDetailDto {
    return {
      id: f.id,
      code: f.code,
      name: f.name,
      is_default: f.isDefault,
      groups: f.groups.map((g) => ({
        id: g.id,
        name: g.name,
        column: g.column,
        position: g.position,
        attributes: g.attributes.map((a) => ({
          id: a.id,
          attribute_id: a.attributeId,
          code: a.code,
          admin_label: a.adminLabel,
          type: a.type,
          position: a.position,
        })),
      })),
    };
  }
}
