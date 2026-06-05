import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { ListRolesUseCase } from '../../application/use-cases/list-roles.use-case';
import { GetRoleUseCase } from '../../application/use-cases/get-role.use-case';
import { CreateRoleUseCase } from '../../application/use-cases/create-role.use-case';
import { UpdateRoleUseCase } from '../../application/use-cases/update-role.use-case';
import { DeleteRoleUseCase } from '../../application/use-cases/delete-role.use-case';
import { CurrentAdmin, AuthenticatedAdmin } from '../decorators/current-admin.decorator';
import { Requires } from '../decorators/requires.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { CreateRoleDto } from '../dto/create-role.dto';
import { UpdateRoleDto } from '../dto/update-role.dto';
import {
  CreateRoleResponseDto,
  RoleDetailDto,
  RoleListItemDto,
  UpdateRoleResponseDto,
} from '../dto/roles-response.dto';

@ApiTags('Admin Roles')
@ApiBearerAuth()
@Controller('admin/roles')
@UseGuards(JwtAdminGuard, PermissionsGuard)
export class RolesController {
  constructor(
    private readonly listRoles: ListRolesUseCase,
    private readonly getRole: GetRoleUseCase,
    private readonly createRole: CreateRoleUseCase,
    private readonly updateRole: UpdateRoleUseCase,
    private readonly deleteRole: DeleteRoleUseCase,
  ) {}

  @Get()
  @Requires('rbac.role.read')
  @ApiOperation({ summary: 'List roles with assigned counts (FR-RBAC-020)' })
  @ApiOkResponse({ type: RoleListItemDto, isArray: true })
  async list(): Promise<RoleListItemDto[]> {
    const rows = await this.listRoles.execute();
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      is_system: r.isSystem,
      assigned_count: r.assignedCount,
      permission_count: r.permissionCount,
    }));
  }

  @Get(':id')
  @Requires('rbac.role.read')
  @ApiOperation({ summary: 'Role detail with permission set (FR-RBAC-021)' })
  @ApiOkResponse({ type: RoleDetailDto })
  @ApiNotFoundResponse({ description: 'Role not found' })
  async detail(@Param('id') id: string): Promise<RoleDetailDto> {
    const role = await this.getRole.execute(id);
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      is_system: role.isSystem,
      updated_at: role.updatedAt.toISOString(),
      permissions: role.permissions,
    };
  }

  @Post()
  @Requires('rbac.role.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a custom role (FR-RBAC-021)' })
  @ApiCreatedResponse({ type: CreateRoleResponseDto })
  @ApiBadRequestResponse({ description: 'Duplicate name or unknown permission code' })
  async create(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateRoleDto,
    @Ip() ip: string,
  ): Promise<CreateRoleResponseDto> {
    return this.createRole.execute({
      actorAdminId: admin.adminId,
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
      ipAddress: ip,
    });
  }

  @Patch(':id')
  @Requires('rbac.role.update')
  @ApiOperation({ summary: 'Update a role (perms/name/desc); Super Admin perms locked (FR-RBAC-022/023/025)' })
  @ApiOkResponse({ type: UpdateRoleResponseDto })
  @ApiForbiddenResponse({ description: 'Editing Super Admin permissions' })
  @ApiConflictResponse({ description: 'Concurrent edit conflict' })
  @ApiBadRequestResponse({ description: 'System role name change / duplicate / bad code' })
  async update(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @Ip() ip: string,
  ): Promise<UpdateRoleResponseDto> {
    const result = await this.updateRole.execute({
      actorAdminId: admin.adminId,
      targetId: id,
      name: dto.name,
      description: dto.description,
      permissions: dto.permissions,
      updatedAt: dto.updated_at,
      ipAddress: ip,
    });
    return { id: result.id, permission_count: result.permissionCount };
  }

  @Delete(':id')
  @Requires('rbac.role.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom, unassigned role (FR-RBAC-024)' })
  @ApiConflictResponse({ description: 'Role is system or assigned (ROLE_IN_USE)' })
  async remove(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.deleteRole.execute({ actorAdminId: admin.adminId, targetId: id, ipAddress: ip });
  }
}
