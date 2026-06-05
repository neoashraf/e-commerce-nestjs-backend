import { AdminUserStatus } from '../enums/admin-user-status.enum';
import { AdminUser } from '../entities/admin-user.entity';

export interface AdminUserListFilter {
  status?: AdminUserStatus;
  roleId?: string;
  search?: string;
  includeDeleted?: boolean;
  page: number;
  limit: number;
}

export interface IAdminUserRepository {
  findById(id: string): Promise<AdminUser | null>;
  /** Active (non-deleted) admin by login email. */
  findByEmail(email: string): Promise<AdminUser | null>;
  /** Paginated/filtered directory; excludes soft-deleted unless `includeDeleted` (FR-RBAC-015). */
  findAll(filter: AdminUserListFilter): Promise<{ items: AdminUser[]; total: number }>;
  save(admin: AdminUser): Promise<AdminUser>;
  countActiveByRoleId(roleId: string): Promise<number>;
}

export const ADMIN_USER_REPOSITORY = Symbol('IAdminUserRepository');
