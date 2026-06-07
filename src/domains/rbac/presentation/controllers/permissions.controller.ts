import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PERMISSION_CATALOG } from '../../domain/permission-catalog';
import { Requires } from '../decorators/requires.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PermissionCatalogItemDto } from '../dto/roles-response.dto';

@ApiTags('Admin Roles')
@ApiBearerAuth()
@Controller('admin/permissions')
@UseGuards(JwtAdminGuard, PermissionsGuard)
export class PermissionsController {
  @Get()
  @Requires('rbac.role.read')
  @ApiOperation({ summary: 'The fixed permission catalog (FR-RBAC-030)' })
  @ApiOkResponse({ type: PermissionCatalogItemDto, isArray: true })
  list(): PermissionCatalogItemDto[] {
    return PERMISSION_CATALOG.map((p) => ({
      code: p.code,
      module: p.module,
      description: p.description,
    }));
  }
}
