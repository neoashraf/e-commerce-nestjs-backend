import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedCustomer {
  customerId: string;
  /** The refresh-session that minted this access token (`sid` JWT claim). Optional to
   * remain compatible with legacy access tokens issued before the claim was added. */
  sessionId?: string;
  /** True when the session was created through a completed second factor (`mfa` claim, FR-MFA-018). */
  mfaVerified?: boolean;
}

/** Reads the authenticated customer (set by JwtCustomerGuard/strategy) off the request. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedCustomer }>();
    return request.user;
  },
);
