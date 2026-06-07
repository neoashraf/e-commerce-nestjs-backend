import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import { PermissionService } from '../../application/services/permission.service';
import { AuditService } from '../../application/services/audit.service';
import { AuthenticatedAdmin } from '../decorators/current-admin.decorator';
import { REQUIRES_PERMISSION } from '../decorators/requires.decorator';

/**
 * Server-side permission gate (FR-RBAC-031, 034). Runs after JwtAdminGuard. When a route
 * declares `@Requires(code)` and the caller's role lacks it, returns `403` and records a
 * `denied` security event (FR-RBAC-043). No `@Requires` → any authenticated admin passes.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedAdmin }>();
    const admin = request.user;
    if (!admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }

    const allowed = await this.permissions.hasPermission(admin.roleId, required);
    if (!allowed) {
      await this.audit.record({
        actorAdminId: admin.adminId,
        action: required,
        result: AuditResult.DENIED,
        summary: { method: request.method, path: request.url },
        ipAddress: request.ip ?? null,
      });
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }
    return true;
  }
}
