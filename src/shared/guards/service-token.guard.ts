import { timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guards internal service-to-service endpoints (`/api/v1/internal/*`).
 *
 * Requires a shared service token — NOT a customer or admin JWT — presented as
 * `Authorization: Bearer <token>`. The expected token comes from the
 * `INTERNAL_SERVICE_TOKEN` env var (dev fallback so local flows are testable,
 * mirroring the JWT secret fallback convention). Trusted callers (e.g. CART
 * checkout placement) carry the token; customer/admin tokens never match.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['authorization'];
    const provided =
      typeof header === 'string' && header.toLowerCase().startsWith('bearer ')
        ? header.slice(7).trim()
        : null;

    if (!provided) {
      throw new UnauthorizedException({
        code: 'SERVICE_TOKEN_REQUIRED',
        message: 'A service token is required for this internal endpoint.',
      });
    }

    const expected =
      this.config.get<string>('INTERNAL_SERVICE_TOKEN') ?? 'dev-internal-token';

    if (!ServiceTokenGuard.safeEqual(provided, expected)) {
      throw new UnauthorizedException({
        code: 'INVALID_SERVICE_TOKEN',
        message: 'Invalid service token.',
      });
    }
    return true;
  }

  /** Constant-time comparison; length mismatch short-circuits without leaking timing. */
  private static safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
