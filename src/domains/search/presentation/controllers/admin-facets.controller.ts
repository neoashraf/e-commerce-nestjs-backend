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
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { FacetResolverService } from '../../application/services/facet-resolver.service';
import { CreateFacetDto, FacetCreatedDto, UpdateFacetDto } from '../dto/facet.dto';

/**
 * Admin Facet manager (FR-SRCH-035; contract: Admin — Facets). CRUD + reorder/activate of facet
 * definitions, gated by `search.facet.manage`; `400` on duplicate `key` and on `source=attribute` with a
 * missing `source_attribute_key`. Changes apply on the next query.
 */
@ApiTags('Search — Admin Facets')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/search/facets')
export class AdminFacetsController {
  constructor(private readonly facets: FacetResolverService) {}

  @Get()
  @Requires('search.facet.manage')
  @ApiOperation({ summary: 'List facet definitions (ordered)' })
  @ApiOkResponse({ description: 'Facet definitions' })
  list() {
    return this.facets.list();
  }

  @Post()
  @Requires('search.facet.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a facet definition' })
  @ApiCreatedResponse({ type: FacetCreatedDto })
  @ApiBadRequestResponse({ description: 'FACET_KEY_EXISTS / SOURCE_ATTRIBUTE_KEY_REQUIRED' })
  async create(@Body() dto: CreateFacetDto): Promise<FacetCreatedDto> {
    const created = await this.facets.create(dto);
    return { id: created.id, key: created.key };
  }

  @Patch(':id')
  @Requires('search.facet.manage')
  @ApiOperation({ summary: 'Update / reorder / activate a facet definition' })
  @ApiBadRequestResponse({ description: 'FACET_KEY_EXISTS / SOURCE_ATTRIBUTE_KEY_REQUIRED' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacetDto) {
    return this.facets.update(id, dto);
  }

  @Delete(':id')
  @Requires('search.facet.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Delete a facet definition' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.facets.remove(id);
  }
}
