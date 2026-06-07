import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { CustomerTagsService } from './customer-tags.service';
import { CreateTagDto } from './dto/tag.dto';
import { TagDto } from './dto/customer-responses';

/**
 * Customer tag catalog (FR-CUST-031; contract: /admin/customer-tags). Create/list the shared tag catalog
 * used by the directory filter, per-customer assignment, and export segmentation. Gated by
 * `customers.tag.manage`.
 */
@ApiTags('Customers — Tags')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/customer-tags')
export class CustomerTagsController {
  constructor(private readonly tags: CustomerTagsService) {}

  @Get()
  @Requires('customers.tag.manage')
  @ApiOperation({ summary: 'List the customer tag catalog' })
  @ApiOkResponse({ type: [TagDto] })
  list(): Promise<TagDto[]> {
    return this.tags.listTags();
  }

  @Post()
  @Requires('customers.tag.manage')
  @ApiOperation({ summary: 'Create a tag in the catalog' })
  @ApiCreatedResponse({ type: TagDto })
  @ApiConflictResponse({ description: 'TAG_EXISTS' })
  create(@Body() dto: CreateTagDto): Promise<TagDto> {
    return this.tags.createTag(dto.key, dto.label, dto.color);
  }
}
