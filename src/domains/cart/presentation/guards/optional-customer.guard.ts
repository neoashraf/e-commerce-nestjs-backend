import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthenticatedCustomer } from '../../../../shared/decorators/current-customer.decorator';

/**
 * Optional customer auth for the public cart surface. The cart accepts **either** a customer access
 * token **or** an `X-Cart-Token` guest token, so this guard authenticates when a valid customer token
 * is present but never rejects when it's absent/invalid — leaving `req.user` undefined for guests
 * (who are then identified by the cart token). Reuses the `jwt-customer` strategy.
 */
@Injectable()
export class OptionalCustomerGuard extends AuthGuard('jwt-customer') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Swallow — guests are allowed; identity falls back to the cart token.
    }
    return true;
  }

  handleRequest<TUser = AuthenticatedCustomer>(_err: unknown, user: TUser): TUser {
    // Return the user when present; never throw for the optional path.
    return user as TUser;
  }
}
