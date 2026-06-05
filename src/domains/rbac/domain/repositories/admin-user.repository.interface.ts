import { AdminUser } from '../entities/admin-user.entity';

export interface IAdminUserRepository {
  findById(id: string): Promise<AdminUser | null>;
  /** Active (non-deleted) admin by login email. */
  findByEmail(email: string): Promise<AdminUser | null>;
  save(admin: AdminUser): Promise<AdminUser>;
  countActiveByRoleId(roleId: string): Promise<number>;
}

export const ADMIN_USER_REPOSITORY = Symbol('IAdminUserRepository');
