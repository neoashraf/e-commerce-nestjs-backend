import { Role } from '../entities/role.entity';

export interface IRoleRepository {
  findById(id: string): Promise<Role | null>;
  findByName(name: string): Promise<Role | null>;
  /** Permission codes granted to a (non-super) role, from `role_permissions`. */
  findPermissionCodes(roleId: string): Promise<string[]>;
}

export const ROLE_REPOSITORY = Symbol('IRoleRepository');
