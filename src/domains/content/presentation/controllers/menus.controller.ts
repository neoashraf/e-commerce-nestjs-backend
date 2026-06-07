import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { MenuItemNode, MenusService } from '../../application/services/menus.service';
import { MenuUpdatedDto, PutMenuDto } from '../dto/put-menu.dto';

/**
 * Admin CMS menus (FR-CMS-030/031; contract: Admin — Menus). GET returns the ordered tree; PUT replaces
 * the whole ordered tree (one level of nesting). Gated by `content.menu.manage`. The storefront consumes
 * the published menu via the homepage payload (cms-merchandising-be).
 */
@ApiTags('Content — Admin Menus')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/menus')
export class MenusController {
  constructor(private readonly menus: MenusService) {}

  @Get(':menu')
  @Requires('content.menu.manage')
  @ApiOperation({ summary: 'Get the ordered menu tree (header | footer)' })
  @ApiParam({ name: 'menu', example: 'header', enum: ['header', 'footer'] })
  @ApiOkResponse({ description: 'Ordered menu tree' })
  @ApiBadRequestResponse({ description: 'INVALID_MENU' })
  getTree(@Param('menu') menu: string): Promise<MenuItemNode[]> {
    return this.menus.getTree(menu);
  }

  @Put(':menu')
  @Requires('content.menu.manage')
  @ApiOperation({ summary: 'Replace the whole ordered menu tree' })
  @ApiParam({ name: 'menu', example: 'header', enum: ['header', 'footer'] })
  @ApiOkResponse({ type: MenuUpdatedDto })
  @ApiBadRequestResponse({ description: 'INVALID_MENU / INVALID_MENU_ITEM / NESTING_TOO_DEEP' })
  async replaceTree(@Param('menu') menu: string, @Body() dto: PutMenuDto): Promise<MenuUpdatedDto> {
    await this.menus.replaceTree(menu, dto.items);
    return { updated: true };
  }
}
