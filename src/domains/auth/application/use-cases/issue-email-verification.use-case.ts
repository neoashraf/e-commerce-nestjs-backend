import { randomUUID } from 'crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';

import { EmailVerificationToken } from '../../domain/entities/email-verification-token.entity';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  IEmailVerificationTokenRepository,
} from '../../domain/repositories/email-verification-token.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import {
  IVerificationTokenService,
  VERIFICATION_TOKEN_SERVICE,
} from '../ports/verification-token.port';

export interface IssueEmailVerificationCommand {
  customerId: string;
  email: string;
  fullName: string;
  /** Resend paths enforce a cooldown (AC4); the initial register/email-change send does not. */
  enforceCooldown?: boolean;
}

/**
 * Reusable email-verification issuance (FR-AUTH-002, 043): mints a single-use token,
 * persists only its hash, and dispatches `auth.email_verify` via NOTIF. Exported so the
 * register flow, profile email-change, and the resend path all share one implementation (AC4).
 */
@Injectable()
export class IssueEmailVerificationUseCase {
  private readonly logger = new Logger(IssueEmailVerificationUseCase.name);

  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokens: IEmailVerificationTokenRepository,
    @Inject(VERIFICATION_TOKEN_SERVICE) private readonly tokenService: IVerificationTokenService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: IssueEmailVerificationCommand): Promise<void> {
    const now = new Date();

    if (command.enforceCooldown) {
      const latest = await this.tokens.findLatestByCustomer(command.customerId);
      if (latest) {
        const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
        if (elapsed < this.config.emailVerifyResendCooldownSeconds) {
          throw new HttpException(
            {
              code: 'VERIFY_EMAIL_COOLDOWN',
              message: 'Please wait before requesting another verification email.',
              retry_after: Math.ceil(this.config.emailVerifyResendCooldownSeconds - elapsed),
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    // Only the latest link should be valid.
    await this.tokens.consumeOutstandingForCustomer(command.customerId, now);

    const minted = this.tokenService.mint();
    const token = EmailVerificationToken.issue(
      randomUUID(),
      command.customerId,
      minted.hash,
      this.config.emailVerifyTtlSeconds,
      now,
    );
    await this.tokens.save(token);

    try {
      await this.dispatcher.dispatchEmailVerification({
        email: command.email,
        fullName: command.fullName,
        token: minted.raw,
        ttlMinutes: Math.ceil(this.config.emailVerifyTtlSeconds / 60),
      });
    } catch (err) {
      // Registration must not fail because the email couldn't be sent; the customer can
      // resend. Log and continue (the account + tokens are already issued).
      this.logger.error(
        `Email-verify dispatch failed for ${command.email}: ${(err as Error).message}`,
      );
    }
  }
}
