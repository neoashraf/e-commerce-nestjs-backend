import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Authenticated admin context attached by AdminJwtStrategy / JwtAdminGuard. */
export interface AuthenticatedAdmin {
  adminId: string;
  roleId: string;
}

/** Reads the authenticated admin off the request. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedAdmin }>();
    return request.user;
  },
);
