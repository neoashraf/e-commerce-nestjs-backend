import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthenticatedCustomer } from '../../../shared/decorators/current-customer.decorator';

/**
 * Optional customer auth for the public submit endpoint (FR-LEAD-003). Reuses the `jwt-customer`
 * strategy but never rejects: a valid customer token populates `request.user` (so the lead links to the
 * account); a missing/invalid/expired token simply leaves the submission anonymous (guest). Never throws.
 */
@Injectable()
export class OptionalJwtCustomerGuard extends AuthGuard('jwt-customer') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(context);
    } catch {
      // Anonymous submission — ignore auth failures.
    }
    return true;
  }

  handleRequest<TUser = AuthenticatedCustomer>(_err: unknown, user: TUser): TUser | undefined {
    // Return the customer when present; never throw on absence (public endpoint).
    return user || undefined;
  }
}
