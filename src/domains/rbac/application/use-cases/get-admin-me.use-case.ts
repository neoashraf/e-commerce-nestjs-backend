import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { IRoleRepository, ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { PermissionService } from '../services/permission.service';

export interface AdminMeView {
  id: string;
  fullName: string;
  email: string;
  roleName: string;
  permissions: string[];
}

/** The authenticated admin + their effective permission list (FR-RBAC-032). */
@Injectable()
export class GetAdminMeUseCase {
  constructor(
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: IRoleRepository,
    private readonly permissions: PermissionService,
  ) {}

  async execute(adminId: string): Promise<AdminMeView> {
    const admin = await this.admins.findById(adminId);
    if (!admin) {
      throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Admin not found.' });
    }
    const role = await this.roles.findById(admin.roleId);
    const permissions = await this.permissions.getEffectivePermissions(admin.roleId);
    return {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      roleName: role?.name ?? 'Unknown',
      permissions,
    };
  }
}
