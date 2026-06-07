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
import { MerchandisingService } from '../../application/services/merchandising.service';
import { CreateSectionDto, IdResponseDto, ReorderDto, UpdateSectionDto } from '../dto/merchandising.dto';

/** Admin homepage sections (FR-CMS-020–022; contract: Admin — Homepage Sections). content.section.manage. */
@ApiTags('Content — Admin Home Sections')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/home-sections')
export class HomeSectionsController {
  constructor(private readonly merch: MerchandisingService) {}

  @Get()
  @Requires('content.section.manage')
  @ApiOperation({ summary: 'List homepage sections (ordered)' })
  @ApiOkResponse({ description: 'Sections' })
  list() {
    return this.merch.listSections();
  }

  @Post()
  @Requires('content.section.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a homepage section (featured categories/products)' })
  @ApiCreatedResponse({ type: IdResponseDto })
  @ApiBadRequestResponse({ description: 'EMPTY_ITEMS / INVALID_ITEM / INVALID_SECTION_TYPE' })
  async create(@Body() dto: CreateSectionDto): Promise<IdResponseDto> {
    const section = await this.merch.createSection(dto);
    return { id: section.id };
  }

  @Patch('reorder')
  @Requires('content.section.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder homepage sections' })
  @ApiOkResponse({ description: 'Reordered' })
  async reorder(@Body() dto: ReorderDto): Promise<{ reordered: boolean }> {
    await this.merch.reorderSections(dto.ordered_ids);
    return { reordered: true };
  }

  @Patch(':id')
  @Requires('content.section.manage')
  @ApiOperation({ summary: 'Update a homepage section' })
  @ApiBadRequestResponse({ description: 'EMPTY_ITEMS / INVALID_ITEM' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto) {
    return this.merch.updateSection(id, dto);
  }

  @Delete(':id')
  @Requires('content.section.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Soft-delete a homepage section' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.merch.deleteSection(id);
  }
}
