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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { SearchConfigService } from '../../application/services/search-config.service';
import {
  CreateRedirectDto,
  CreateSynonymDto,
  UpdateRedirectDto,
  UpdateSynonymDto,
} from '../dto/admin-config.dto';

/**
 * Admin synonyms + redirects (FR-SRCH-011/013; contract: Admin — Synonyms & Redirects). Storage/CRUD
 * lives here because the query path reads it; the admin UI is out of scope. Gated by
 * `search.config.manage`.
 */
@ApiTags('Search — Admin Config')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/search')
export class AdminSearchConfigController {
  constructor(private readonly config: SearchConfigService) {}

  // --- Synonyms ---

  @Get('synonyms')
  @Requires('search.config.manage')
  @ApiOperation({ summary: 'List synonym groups' })
  @ApiOkResponse({ description: 'Synonym groups' })
  listSynonyms() {
    return this.config.listSynonyms();
  }

  @Post('synonyms')
  @Requires('search.config.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a synonym group (≥2 terms)' })
  @ApiBadRequestResponse({ description: 'INVALID_SYNONYM' })
  createSynonym(@Body() dto: CreateSynonymDto) {
    return this.config.createSynonym(dto);
  }

  @Patch('synonyms/:id')
  @Requires('search.config.manage')
  @ApiOperation({ summary: 'Update a synonym group' })
  updateSynonym(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSynonymDto) {
    return this.config.updateSynonym(id, dto);
  }

  @Delete('synonyms/:id')
  @Requires('search.config.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Delete a synonym group' })
  async deleteSynonym(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.config.deleteSynonym(id);
  }

  // --- Redirects ---

  @Get('redirects')
  @Requires('search.config.manage')
  @ApiOperation({ summary: 'List redirect rules' })
  listRedirects() {
    return this.config.listRedirects();
  }

  @Post('redirects')
  @Requires('search.config.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a redirect (unique active query_pattern; target_ref must resolve)' })
  @ApiBadRequestResponse({ description: 'REDIRECT_PATTERN_EXISTS / TARGET_NOT_RESOLVED' })
  createRedirect(@Body() dto: CreateRedirectDto) {
    return this.config.createRedirect(dto);
  }

  @Patch('redirects/:id')
  @Requires('search.config.manage')
  @ApiOperation({ summary: 'Update a redirect' })
  updateRedirect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRedirectDto) {
    return this.config.updateRedirect(id, dto);
  }

  @Delete('redirects/:id')
  @Requires('search.config.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Delete a redirect' })
  async deleteRedirect(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.config.deleteRedirect(id);
  }
}
