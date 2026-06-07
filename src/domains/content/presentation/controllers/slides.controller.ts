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
import { CreateSlideDto, IdResponseDto, ReorderDto, UpdateSlideDto } from '../dto/merchandising.dto';

/** Admin slider/slides (FR-CMS-001–004; contract: Admin — Slider & Slides). Gated by content.slider.manage. */
@ApiTags('Content — Admin Slides')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/slides')
export class SlidesController {
  constructor(private readonly merch: MerchandisingService) {}

  @Get()
  @Requires('content.slider.manage')
  @ApiOperation({ summary: 'List slides (ordered)' })
  @ApiOkResponse({ description: 'Slides' })
  list() {
    return this.merch.listSlides();
  }

  @Post()
  @Requires('content.slider.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a slide' })
  @ApiCreatedResponse({ type: IdResponseDto })
  @ApiBadRequestResponse({ description: 'ALT_TEXT_REQUIRED / LINK_NOT_RESOLVED / INVALID_SCHEDULE' })
  async create(@Body() dto: CreateSlideDto): Promise<IdResponseDto> {
    const slide = await this.merch.createSlide(dto);
    return { id: slide.id };
  }

  @Patch('reorder')
  @Requires('content.slider.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder slides' })
  @ApiOkResponse({ description: 'Reordered' })
  async reorder(@Body() dto: ReorderDto): Promise<{ reordered: boolean }> {
    await this.merch.reorderSlides(dto.ordered_ids);
    return { reordered: true };
  }

  @Patch(':id')
  @Requires('content.slider.manage')
  @ApiOperation({ summary: 'Update a slide' })
  @ApiBadRequestResponse({ description: 'ALT_TEXT_REQUIRED / LINK_NOT_RESOLVED / INVALID_SCHEDULE' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlideDto) {
    return this.merch.updateSlide(id, dto);
  }

  @Delete(':id')
  @Requires('content.slider.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Soft-delete a slide' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.merch.deleteSlide(id);
  }
}
