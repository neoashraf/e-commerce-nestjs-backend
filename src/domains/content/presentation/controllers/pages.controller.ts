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
import { PageListRow, PagesService } from '../../application/services/pages.service';
import {
  CreatePageDto,
  PageCreatedDto,
  PageListRowDto,
  UpdatePageDto,
} from '../dto/page.dto';

/**
 * Admin CMS pages (FR-CMS-040–044; contract: Admin — Pages). Gated by `content.page.manage`. Create
 * defaults to draft; `409` on duplicate slug and on deleting a system/menu-linked page (PAGE_LINKED);
 * `400` on a linked-slug change without confirmation.
 */
@ApiTags('Content — Admin Pages')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/pages')
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Get()
  @Requires('content.page.manage')
  @ApiOperation({ summary: 'List CMS pages (with system badge)' })
  @ApiOkResponse({ type: PageListRowDto, isArray: true })
  list(): Promise<PageListRow[]> {
    return this.pages.list();
  }

  @Get(':id')
  @Requires('content.page.manage')
  @ApiOperation({ summary: 'Get a CMS page by id' })
  @ApiNotFoundResponse({ description: 'PAGE_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.pages.getById(id);
  }

  @Post()
  @Requires('content.page.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a CMS page (draft by default)' })
  @ApiCreatedResponse({ type: PageCreatedDto })
  @ApiBadRequestResponse({ description: 'INVALID_SLUG / EMPTY_BODY' })
  @ApiConflictResponse({ description: 'SLUG_EXISTS' })
  async create(@Body() dto: CreatePageDto): Promise<PageCreatedDto> {
    const page = await this.pages.create(dto);
    return { id: page.id, slug: page.slug, is_published: page.isPublished };
  }

  @Patch(':id')
  @Requires('content.page.manage')
  @ApiOperation({ summary: 'Update a CMS page (publish/unpublish; linked-slug change needs confirm)' })
  @ApiBadRequestResponse({ description: 'INVALID_SLUG / SLUG_CHANGE_REQUIRES_CONFIRMATION' })
  @ApiConflictResponse({ description: 'SLUG_EXISTS' })
  @ApiNotFoundResponse({ description: 'PAGE_NOT_FOUND' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto) {
    return this.pages.update(id, dto);
  }

  @Delete(':id')
  @Requires('content.page.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a CMS page (blocked for system / menu-linked)' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiConflictResponse({ description: 'PAGE_LINKED' })
  @ApiNotFoundResponse({ description: 'PAGE_NOT_FOUND' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.pages.remove(id);
  }
}
