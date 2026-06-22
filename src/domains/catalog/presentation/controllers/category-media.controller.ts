import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { CategoryMediaService } from '../../application/services/category-media.service';
import type { UploadedImageFile } from '../../application/services/product-media.service';
import { CategoryImageSlot } from '../../domain/enums/category-image-slot.enum';
import { UploadCategoryImageResponseDto } from '../dto/category-response.dto';
import { UploadCategoryImageDto } from '../dto/upload-category-image.dto';

/** Admin category media (SRS 02 §5.1; FR-CAT-001/010a). Single-image upload per thumbnail/logo/banner slot. */
@ApiTags('Catalog — Categories')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/categories')
export class CategoryMediaController {
  constructor(private readonly media: CategoryMediaService) {}

  @Post(':id/images')
  @Requires('catalog.category.update')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a category image (thumbnail/logo/banner; JPEG/PNG/WebP ≤5MB)' })
  @ApiCreatedResponse({ type: UploadCategoryImageResponseDto })
  @ApiBadRequestResponse({ description: 'Missing file / unsupported type / too large / invalid slot' })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadCategoryImageDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ url: string; slot: CategoryImageSlot }> {
    return this.media.uploadImage(id, dto.slot, file);
  }
}
