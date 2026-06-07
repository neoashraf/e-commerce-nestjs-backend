import { SUPER_ADMIN_ROLE_NAME } from '../permission-catalog';

/** A named bundle of permissions (SRS 16 §8 Role). */
export class Role {
  constructor(
    public readonly id: string,
    public name: string,
    public description: string | null,
    public isSystem: boolean,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public deletedAt: Date | null,
  ) {}

  /** The Super Admin role is implicitly all-permissions and never editable (FR-RBAC-023, 033). */
  isSuperAdmin(): boolean {
    return this.isSystem && this.name === SUPER_ADMIN_ROLE_NAME;
  }
}
