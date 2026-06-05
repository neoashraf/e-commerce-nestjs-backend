import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Reusable customer access-token guard. Protects `/me/*` and any other
 * customer-authenticated route. Rejects expired/revoked/admin-audience tokens with 401.
 */
@Injectable()
export class JwtCustomerGuard extends AuthGuard('jwt-customer') {}
