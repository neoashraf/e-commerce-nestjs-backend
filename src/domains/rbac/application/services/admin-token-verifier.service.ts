import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';

export interface VerifiedAdmin {
  adminId: string;
  roleId: string;
}

interface AdminJwtPayload {
  sub: string;
  aud?: string;
  role_id?: string;
}

/**
 * Verifies an admin access token the same way {@link AdminJwtStrategy} does — signature + expiry
 * (JwtService), `aud=admin` audience, and a fresh active-admin check (so suspend/delete take effect
 * immediately). Exists as an exportable RBAC service so other modules (NOTIF's SSE stream, which
 * authenticates via a `?token=` query param because EventSource can't set headers) can reuse the
 * exact admin-auth rule without depending on RBAC internals (JwtService / the admin repository).
 * Returns the verified admin, or `null` when the token is missing/invalid/expired/non-admin.
 */
@Injectable()
export class AdminTokenVerifierService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
  ) {}

  async verify(token: string | undefined | null): Promise<VerifiedAdmin | null> {
    if (!token) return null;

    let payload: AdminJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<AdminJwtPayload>(token);
    } catch {
      return null;
    }
    if (payload.aud !== 'admin') return null;

    const admin = await this.admins.findById(payload.sub);
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) return null;

    return { adminId: admin.id, roleId: admin.roleId };
  }
}
