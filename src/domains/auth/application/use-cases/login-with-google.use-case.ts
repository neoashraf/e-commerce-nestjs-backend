import { randomUUID } from 'crypto';
import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { Session } from '../../domain/entities/session.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { GOOGLE_VERIFIER, IGoogleVerifier } from '../ports/google-verifier.port';
import { ITokenService, TOKEN_SERVICE } from '../ports/token-service.port';

export interface LoginWithGoogleCommand {
  idToken: string;
  deviceLabel?: string | null;
}

export interface LoginWithGoogleResult {
  isNewAccount: boolean;
  customer: { id: string; fullName: string; phone: string; email: string | null; phoneVerified: boolean };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

/**
 * Sign in with Google (one-tap / button credential). Verifies the Google ID token, then keys the
 * account by its verified email: an existing account logs in; an unknown email registers a fresh
 * account (email-verified, no password, phone added later). Issues our own JWT access + refresh
 * session — identical to the other login paths. Google's email MUST be verified, else `401`.
 */
@Injectable()
export class LoginWithGoogleUseCase {
  constructor(
    @Inject(GOOGLE_VERIFIER) private readonly google: IGoogleVerifier,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(TOKEN_SERVICE) private readonly tokens: ITokenService,
  ) {}

  async execute(command: LoginWithGoogleCommand): Promise<LoginWithGoogleResult> {
    const now = new Date();
    const profile = await this.google.verify(command.idToken);

    // Only trust a Google-verified email (an unverified Google email can't prove ownership).
    if (!profile.emailVerified) {
      throw new UnauthorizedException({
        code: 'GOOGLE_EMAIL_UNVERIFIED',
        message: 'Your Google email is not verified.',
      });
    }

    let customer = await this.customers.findActiveByEmail(profile.email);
    let isNewAccount = false;

    if (customer) {
      // Link by VERIFIED email only (FR-AUTH-091/093, BR-AUTH-11): if the matching account's
      // email is unverified, it may belong to a squatter — never link or merge. The user must
      // verify that address (proving account ownership) or use another login method.
      if (!customer.emailVerified) {
        throw new ConflictException({
          code: 'EMAIL_UNVERIFIED_CONFLICT',
          message:
            'An account with this email exists but the address is not verified. Verify the email on that account or use another login method.',
        });
      }
      customer.markLoggedIn(now);
      customer = await this.customers.save(customer);
    } else {
      // New email → register. Fall back to the local-part for a name when Google withheld it.
      const name = profile.name?.trim() || profile.email.split('@')[0];
      customer = Customer.registerWithGoogle(randomUUID(), name, profile.email, now);
      customer.markLoggedIn(now);
      customer = await this.customers.save(customer);
      isNewAccount = true;
    }

    const sessionId = randomUUID();
    const access = await this.tokens.signAccessToken(customer.id, sessionId);
    const refresh = this.tokens.mintRefreshToken(now);
    await this.sessions.save(
      Session.issue(
        sessionId,
        customer.id,
        refresh.hash,
        refresh.expiresAt,
        now,
        command.deviceLabel ?? null,
      ),
    );

    return {
      isNewAccount,
      customer: {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email,
        phoneVerified: customer.phoneVerified,
      },
      tokens: {
        accessToken: access.token,
        refreshToken: refresh.raw,
        expiresIn: access.expiresIn,
      },
    };
  }
}
