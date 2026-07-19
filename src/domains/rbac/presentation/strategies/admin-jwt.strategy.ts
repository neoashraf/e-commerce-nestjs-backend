import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { requireEnv } from '../../../../shared/config/require-env';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { AuthenticatedAdmin } from '../decorators/current-admin.decorator';

interface AdminJwtPayload {
  sub: string;
  aud?: string;
  role_id?: string;
}

/**
 * Validates admin access tokens. Rejects non-admin-audience tokens (BR-RBAC-7, FR-RBAC-006)
 * and re-checks the admin is still active each request, so suspend/delete take effect
 * immediately (FR-RBAC-013, §12.5). The fresh `role_id` makes role changes apply next
 * request (FR-RBAC-025).
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
  constructor(
    config: ConfigService,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv(config, 'JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: AdminJwtPayload): Promise<AuthenticatedAdmin> {
    if (payload.aud !== 'admin') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token.' });
    }
    const admin = await this.admins.findById(payload.sub);
    if (!admin || admin.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token.' });
    }
    return { adminId: admin.id, roleId: admin.roleId };
  }
}
