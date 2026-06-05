import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { PasswordResetToken } from '../../domain/entities/password-reset-token.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from '../../domain/repositories/password-reset-token.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

export interface RequestPasswordResetCommand {
  email: string;
}

/**
 * Email password-reset request (FR-AUTH-033): issues a single-use, time-limited token
 * (hash stored only) and dispatches `auth.password_reset` via NOTIF. The caller ALWAYS
 * returns a generic success message regardless of whether the email exists, so this
 * use-case silently no-ops for unknown emails (anti-enumeration, AC1/AC4).
 */
@Injectable()
export class RequestPasswordResetUseCase {
  private readonly logger = new Logger(RequestPasswordResetUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly tokens: IPasswordResetTokenRepository,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<void> {
    const now = new Date();
    const customer = await this.customers.findActiveByEmail(command.email);

    // Anti-enumeration: do nothing (and reveal nothing) when there is no account with
    // this email. The controller returns the same generic message either way.
    if (!customer || !customer.email) {
      return;
    }

    // Only the latest reset link should be valid.
    await this.tokens.consumeOutstandingForCustomer(customer.id, now);

    const minted = this.tokenService.mint();
    const token = PasswordResetToken.issue(
      randomUUID(),
      customer.id,
      minted.hash,
      this.config.passwordResetTtlSeconds,
      now,
    );
    await this.tokens.save(token);

    try {
      await this.dispatcher.dispatchPasswordReset({
        email: customer.email,
        fullName: customer.fullName,
        token: minted.raw,
        ttlMinutes: Math.ceil(this.config.passwordResetTtlSeconds / 60),
      });
    } catch (err) {
      // The reset must not fail (or differ observably) because the email couldn't be
      // sent; the customer can request again. Log and continue.
      this.logger.error(
        `Password-reset dispatch failed for ${customer.email}: ${(err as Error).message}`,
      );
    }
  }
}
