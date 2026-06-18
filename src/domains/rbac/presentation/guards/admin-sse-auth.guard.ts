import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

import { AdminTokenVerifierService } from '../../application/services/admin-token-verifier.service';
import { AuthenticatedAdmin } from '../decorators/current-admin.decorator';

const INVALID = { code: 'INVALID_TOKEN', message: 'Invalid token.' } as const;

/**
 * Admin auth for the SSE notification stream (FR-NOTIF-075). The browser `EventSource` cannot set an
 * `Authorization` header, so the admin access token arrives as the `?token=` query parameter. This
 * guard validates it via {@link AdminTokenVerifierService} (the same rule as {@link AdminJwtStrategy})
 * and binds the request to the admin.
 *
 * It depends ONLY on the RBAC-exported verifier — not JwtService / the admin repository directly — so
 * it resolves cleanly when instantiated in a consuming module's context (e.g. NOTIF's feed controller
 * applies it via `@UseGuards`; guards referenced that way are created in the host module's injector).
 */
@Injectable()
export class AdminSseAuthGuard implements CanActivate {
  constructor(private readonly verifier: AdminTokenVerifierService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedAdmin }>();
    const raw = request.query?.token;
    const token = typeof raw === 'string' ? raw : undefined;

    const admin = await this.verifier.verify(token);
    if (!admin) throw new UnauthorizedException(INVALID);

    request.user = { adminId: admin.adminId, roleId: admin.roleId };
    return true;
  }
}
