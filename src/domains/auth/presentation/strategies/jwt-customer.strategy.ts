import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { AuthenticatedCustomer } from '../../../../shared/decorators/current-customer.decorator';

interface JwtPayload {
  sub: string;
  aud?: string;
}

@Injectable()
export class JwtCustomerStrategy extends PassportStrategy(Strategy, 'jwt-customer') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-access-secret',
    });
  }

  validate(payload: JwtPayload): AuthenticatedCustomer {
    // Reject admin-audience or audience-less tokens on customer routes (FR-AUTH-016).
    if (payload.aud !== 'customer') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN', message: 'Invalid token.' });
    }
    return { customerId: payload.sub };
  }
}
