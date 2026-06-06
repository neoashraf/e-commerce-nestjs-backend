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
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { MerchandisingService } from '../../application/services/merchandising.service';
import { CreateBannerDto, IdResponseDto, UpdateBannerDto } from '../dto/merchandising.dto';

/** Admin banners (FR-CMS-010–012; contract: Admin — Banners). Gated by content.banner.manage. */
@ApiTags('Content — Admin Banners')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/banners')
export class BannersController {
  constructor(private readonly merch: MerchandisingService) {}

  @Get()
  @Requires('content.banner.manage')
  @ApiOperation({ summary: 'List banners (optionally by placement)' })
  @ApiQuery({ name: 'placement', required: false, example: 'home_top' })
  @ApiOkResponse({ description: 'Banners' })
  list(@Query('placement') placement?: string) {
    return this.merch.listBanners(placement);
  }

  @Post()
  @Requires('content.banner.manage')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a banner' })
  @ApiCreatedResponse({ type: IdResponseDto })
  @ApiBadRequestResponse({ description: 'ALT_TEXT_REQUIRED / LINK_NOT_RESOLVED / INVALID_SCHEDULE' })
  @ApiConflictResponse({ description: 'PLACEMENT_LIMIT_REACHED' })
  async create(@Body() dto: CreateBannerDto): Promise<IdResponseDto> {
    const banner = await this.merch.createBanner(dto);
    return { id: banner.id };
  }

  @Patch(':id')
  @Requires('content.banner.manage')
  @ApiOperation({ summary: 'Update / activate a banner (placement limit applies on activate)' })
  @ApiConflictResponse({ description: 'PLACEMENT_LIMIT_REACHED' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBannerDto) {
    return this.merch.updateBanner(id, dto);
  }

  @Delete(':id')
  @Requires('content.banner.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiOperation({ summary: 'Soft-delete a banner' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.merch.deleteBanner(id);
  }
}
