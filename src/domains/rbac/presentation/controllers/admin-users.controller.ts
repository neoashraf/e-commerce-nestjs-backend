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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { ListAdminUsersUseCase } from '../../application/use-cases/list-admin-users.use-case';
import { InviteAdminUserUseCase } from '../../application/use-cases/invite-admin-user.use-case';
import { UpdateAdminUserUseCase } from '../../application/use-cases/update-admin-user.use-case';
import { SuspendAdminUserUseCase } from '../../application/use-cases/suspend-admin-user.use-case';
import { ReactivateAdminUserUseCase } from '../../application/use-cases/reactivate-admin-user.use-case';
import { DeleteAdminUserUseCase } from '../../application/use-cases/delete-admin-user.use-case';
import { ResendInviteUseCase } from '../../application/use-cases/resend-invite.use-case';
import { CurrentAdmin, AuthenticatedAdmin } from '../decorators/current-admin.decorator';
import { Requires } from '../decorators/requires.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { ListAdminUsersQueryDto } from '../dto/list-admin-users.dto';
import { InviteAdminUserDto } from '../dto/invite-admin-user.dto';
import { UpdateAdminUserDto } from '../dto/update-admin-user.dto';
import {
  AdminUserListItemDto,
  AdminUserStatusResponseDto,
  InviteAdminUserResponseDto,
  ResendInviteResponseDto,
  UpdateAdminUserResponseDto,
} from '../dto/admin-users-response.dto';

@ApiTags('Admin Users')
@ApiBearerAuth()
@Controller('admin/users')
@UseGuards(JwtAdminGuard, PermissionsGuard)
export class AdminUsersController {
  constructor(
    private readonly listUsers: ListAdminUsersUseCase,
    private readonly inviteUser: InviteAdminUserUseCase,
    private readonly updateUser: UpdateAdminUserUseCase,
    private readonly suspendUser: SuspendAdminUserUseCase,
    private readonly reactivateUser: ReactivateAdminUserUseCase,
    private readonly deleteUser: DeleteAdminUserUseCase,
    private readonly resendInvite: ResendInviteUseCase,
  ) {}

  @Get()
  @Requires('rbac.admin_user.read')
  @ApiOperation({ summary: 'List admin users (paginated/filtered) (FR-RBAC-015)' })
  @ApiOkResponse({ type: AdminUserListItemDto, isArray: true })
  async list(@Query() query: ListAdminUsersQueryDto): Promise<Paginated<AdminUserListItemDto>> {
    const result = await this.listUsers.execute({
      status: query.status,
      roleId: query.role_id,
      search: query.search,
      includeDeleted: query.include_deleted ?? false,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
    const items: AdminUserListItemDto[] = result.items.map((a) => ({
      id: a.id,
      full_name: a.fullName,
      email: a.email,
      role_id: a.roleId,
      role: a.role,
      status: a.status,
      last_login_at: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    }));
    return new Paginated(items, { page: result.page, limit: result.limit, total: result.total });
  }

  @Post()
  @Requires('rbac.admin_user.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite an admin user (FR-RBAC-010/011)' })
  @ApiCreatedResponse({ type: InviteAdminUserResponseDto })
  @ApiConflictResponse({ description: 'Email already in use' })
  @ApiNotFoundResponse({ description: 'Role not found' })
  async invite(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: InviteAdminUserDto,
    @Ip() ip: string,
  ): Promise<InviteAdminUserResponseDto> {
    const result = await this.inviteUser.execute({
      actorAdminId: admin.adminId,
      fullName: dto.full_name,
      email: dto.email,
      phone: dto.phone,
      roleId: dto.role_id,
      ipAddress: ip,
    });
    return { id: result.id, status: result.status, invite_sent: result.inviteSent };
  }

  @Patch(':id')
  @Requires('rbac.admin_user.update')
  @ApiOperation({ summary: 'Edit an admin user (name/phone/role); email immutable (FR-RBAC-012)' })
  @ApiOkResponse({ type: UpdateAdminUserResponseDto })
  @ApiForbiddenResponse({ description: 'Cannot change own role' })
  @ApiConflictResponse({ description: 'Would breach the Super Admin Floor' })
  async update(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @Ip() ip: string,
  ): Promise<UpdateAdminUserResponseDto> {
    return this.updateUser.execute({
      actorAdminId: admin.adminId,
      targetId: id,
      fullName: dto.full_name,
      phone: dto.phone,
      roleId: dto.role_id,
      ipAddress: ip,
    });
  }

  @Post(':id/suspend')
  @Requires('rbac.admin_user.suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend an admin (revokes sessions) (FR-RBAC-013)' })
  @ApiOkResponse({ type: AdminUserStatusResponseDto })
  @ApiForbiddenResponse({ description: 'Cannot suspend self' })
  @ApiConflictResponse({ description: 'Super Admin Floor' })
  async suspend(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminUserStatusResponseDto> {
    return this.suspendUser.execute({ actorAdminId: admin.adminId, targetId: id, ipAddress: ip });
  }

  @Post(':id/reactivate')
  @Requires('rbac.admin_user.suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a suspended admin (FR-RBAC-014)' })
  @ApiOkResponse({ type: AdminUserStatusResponseDto })
  async reactivate(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<AdminUserStatusResponseDto> {
    return this.reactivateUser.execute({ actorAdminId: admin.adminId, targetId: id, ipAddress: ip });
  }

  @Delete(':id')
  @Requires('rbac.admin_user.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete an admin (FR-RBAC-015/016/017)' })
  @ApiForbiddenResponse({ description: 'Cannot delete self' })
  @ApiConflictResponse({ description: 'Super Admin Floor' })
  async remove(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.deleteUser.execute({ actorAdminId: admin.adminId, targetId: id, ipAddress: ip });
  }

  @Post(':id/resend-invite')
  @Requires('rbac.admin_user.create')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend a set-password invite (pending only) (FR-RBAC-010)' })
  @ApiOkResponse({ type: ResendInviteResponseDto })
  @ApiConflictResponse({ description: 'Admin is not pending' })
  async resend(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id') id: string,
    @Ip() ip: string,
  ): Promise<ResendInviteResponseDto> {
    const result = await this.resendInvite.execute({ actorAdminId: admin.adminId, targetId: id, ipAddress: ip });
    return { id: result.id, invite_sent: result.inviteSent };
  }
}
