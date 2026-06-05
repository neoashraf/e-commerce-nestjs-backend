import { AdminSession } from '../entities/admin-session.entity';

export interface IAdminSessionRepository {
  findByRefreshTokenHash(hash: string): Promise<AdminSession | null>;
  save(session: AdminSession): Promise<AdminSession>;
  /** Revoke every active session for an admin (logout-all / suspend / reset — BR-RBAC-10). */
  revokeAllForAdmin(adminUserId: string, now: Date): Promise<void>;
}

export const ADMIN_SESSION_REPOSITORY = Symbol('IAdminSessionRepository');
