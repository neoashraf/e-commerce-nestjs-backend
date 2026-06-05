import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthenticatedCustomer {
  customerId: string;
}

/** Reads the authenticated customer (set by JwtCustomerGuard/strategy) off the request. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedCustomer }>();
    return request.user;
  },
);
