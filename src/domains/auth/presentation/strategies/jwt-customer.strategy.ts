import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { requireEnv } from '../../../../shared/config/require-env';
import { AuthenticatedCustomer } from '../../../../shared/decorators/current-customer.decorator';

interface JwtPayload {
  sub: string;
  aud?: string;
  sid?: string;
  /** True when the session was created through a completed second factor (FR-MFA-018). */
  mfa?: boolean;
}

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(Strategy, 'jwt-customer') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: requireEnv(config, 'JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): AuthenticatedCustomer {
    // Reject admin-audience or audience-less tokens on customer routes (FR-AUTH-016).
    if (payload.aud !== 'customer') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token.' });
    }
    return { customerId: payload.sub, sessionId: payload.sid, mfaVerified: payload.mfa === true };
  }
}
