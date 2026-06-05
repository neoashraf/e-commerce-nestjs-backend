import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Reusable admin access-token guard. Protects every `/admin/*` route (except the public
 * `/admin/auth/*` endpoints). Rejects expired/revoked/non-admin-audience tokens with 401.
 */
@Injectable()
export class JwtAdminGuard extends AuthGuard('jwt-admin') {}
