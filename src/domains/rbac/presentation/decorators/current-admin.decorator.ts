import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Authenticated admin context attached by AdminJwtStrategy / JwtAdminGuard. */
export interface AuthenticatedAdmin {
  adminId: string;
  roleId: string;
  /** The refresh session that minted this token (`sid` claim); optional for legacy tokens. */
  sessionId?: string;
  /** True when the login passed the 2FA step (`mfa` claim, FR-RBAC-009). */
  mfaVerified?: boolean;
}

/** Reads the authenticated admin off the request. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedAdmin }>();
    return request.user;
  },
);
