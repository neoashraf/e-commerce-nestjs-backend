import { Role } from '../entities/role.entity';

export interface IRoleRepository {
  findById(id: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  /** All non-deleted roles (FR-RBAC-020). */
  findAll(): Promise<Role[]>;
  /** Permission codes granted to a (non-super) role, from `role_permissions`. */
  findPermissionCodes(roleId: string): Promise<string[]>;
  /** Insert or update the role row (name/description/updated_at). */
  saveRole(role: Role): Promise<Role>;
  /** Replace a role's permission set wholesale (FR-RBAC-022). */
  replacePermissions(roleId: string, codes: string[]): Promise<void>;
  /** Soft-delete a custom role (FR-RBAC-024). */
  softDeleteRole(roleId: string, now: Date): Promise<void>;
}

export const ROLE_REPOSITORY = Symbol('IRoleRepository');
