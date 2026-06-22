import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  ProductMediaService,
  UploadedImageFile,
} from '../../application/services/product-media.service';
import { AddVideoDto } from '../dto/add-video.dto';
import { ReorderImagesDto } from '../dto/reorder-images.dto';
import { UpdateImageDto } from '../dto/update-image.dto';
import { UploadImageDto } from '../dto/upload-image.dto';
import {
  AddVideoResponseDto,
  DeleteImageResponseDto,
  DeleteVideoResponseDto,
  ReorderImagesResponseDto,
  SetPrimaryImageResponseDto,
  UpdateImageResponseDto,
  UploadImageResponseDto,
} from '../dto/product-response.dto';

/** Admin product media (SRS 02 §5.6; contract: Admin — Product media). */
@ApiTags('Catalog — Product media')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/products')
export class ProductMediaController {
  constructor(private readonly media: ProductMediaService) {}

  @Post(':id/images')
  @Requires('catalog.image.create')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a product image (JPEG/PNG/WebP ≤5MB, required alt_text)' })
  @ApiCreatedResponse({ type: UploadImageResponseDto })
  @ApiBadRequestResponse({ description: 'Missing alt_text / unsupported type / too large' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async uploadImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadImageDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ id: string; renditions: Record<string, string> }> {
    return this.media.addImage(file, {
      productId: id,
      altText: dto.alt_text,
      colorOptionId: dto.color_option_id,
      isPrimary: dto.is_primary,
      displayOrder: dto.display_order,
    });
  }

  @Patch(':id/images/reorder')
  @Requires('catalog.image.update')
  @ApiOperation({ summary: 'Reorder the product gallery (full image-id set, in order)' })
  @ApiOkResponse({ type: ReorderImagesResponseDto })
  @ApiBadRequestResponse({ description: 'ordered_ids is not the complete, exact image set' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async reorderImages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderImagesDto,
  ): Promise<{ ordered: string[] }> {
    return this.media.reorderImages(id, dto.ordered_ids);
  }

  @Patch(':id/images/:imageId/primary')
  @Requires('catalog.image.update')
  @ApiOperation({ summary: 'Set an already-uploaded image as the product primary' })
  @ApiOkResponse({ type: SetPrimaryImageResponseDto })
  @ApiNotFoundResponse({ description: 'Product or image not found' })
  async setPrimaryImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<{ id: string; is_primary: boolean }> {
    return this.media.setPrimaryImage(id, imageId);
  }

  @Patch(':id/images/:imageId')
  @Requires('catalog.image.update')
  @ApiOperation({ summary: "Update an image's alt text and/or colour-tag" })
  @ApiOkResponse({ type: UpdateImageResponseDto })
  @ApiBadRequestResponse({ description: 'No fields / empty alt_text / invalid color_option_id' })
  @ApiNotFoundResponse({ description: 'Product or image not found' })
  async updateImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body() dto: UpdateImageDto,
  ): Promise<{ id: string; alt_text: string; color_option_id: string | null }> {
    return this.media.updateImage(id, imageId, {
      altText: dto.alt_text,
      colorOptionId: dto.color_option_id,
    });
  }

  @Delete(':id/images/:imageId')
  @Requires('catalog.image.delete')
  @ApiOperation({
    summary: 'Delete a product image (reassigns primary to the next image if it was primary)',
  })
  @ApiOkResponse({ type: DeleteImageResponseDto })
  @ApiNotFoundResponse({ description: 'Product or image not found' })
  async deleteImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<{ id: string; primary_image_id: string | null }> {
    return this.media.deleteImage(id, imageId);
  }

  @Post(':id/videos')
  @Requires('catalog.image.create')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('application/json', 'multipart/form-data')
  @ApiOperation({ summary: 'Add a product video (source=url external, or source=upload file)' })
  @ApiCreatedResponse({ type: AddVideoResponseDto })
  @ApiBadRequestResponse({ description: 'Missing url (source=url) or file (source=upload)' })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async addVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddVideoDto,
    @UploadedFile() file: UploadedImageFile | undefined,
  ): Promise<{ id: string }> {
    return this.media.addVideo(
      { productId: id, source: dto.source, url: dto.url, displayOrder: dto.display_order },
      file,
    );
  }

  @Delete(':id/videos/:videoId')
  @Requires('catalog.image.delete')
  @ApiOperation({ summary: 'Delete a product video' })
  @ApiOkResponse({ type: DeleteVideoResponseDto })
  @ApiNotFoundResponse({ description: 'Product or video not found' })
  async deleteVideo(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('videoId', ParseUUIDPipe) videoId: string,
  ): Promise<{ id: string }> {
    return this.media.deleteVideo(id, videoId);
  }
}
