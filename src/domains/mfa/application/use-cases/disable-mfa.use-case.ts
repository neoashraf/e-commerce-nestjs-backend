import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { IOtpService, OTP_SERVICE } from '../../../auth/application/ports/otp-service.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../../../auth/application/ports/password-hasher.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../../auth/application/ports/notification-dispatcher.port';
import { Customer } from '../../../auth/domain/entities/customer.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../../auth/domain/repositories/session.repository.interface';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../domain/enums/mfa-challenge-purpose.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';
import {
  IMfaChallengeRepository,
  MFA_CHALLENGE_REPOSITORY,
} from '../../domain/repositories/mfa-challenge.repository.interface';
import {
  IMfaSettingsRepository,
  MFA_SETTINGS_REPOSITORY,
} from '../../domain/repositories/mfa-settings.repository.interface';
import { MFA_CONFIG, MfaConfig } from '../ports/mfa-config.port';
import { MfaChallengeIssuer } from '../services/mfa-challenge-issuer.service';
import {
  destinationFor,
  eligibleChannels,
  maskDestination,
  resolveChallengeChannel,
} from '../services/mfa-channels';

/** HTTP 423 Locked is not in Nest's HttpStatus enum. */
const HTTP_LOCKED = 423;

export interface DisableMfaCommand {
  customerId: string;
  currentPassword: string;
  /** Fresh second-factor code — required when the session is not 2FA-verified (FR-MFA-002). */
  code?: string;
  /** From the access token's `mfa` claim (FR-MFA-018). */
  sessionMfaVerified: boolean;
  /** The session id (JWT `sid`) making the request — spared by the revoke sweep (FR-MFA-007). */
  currentSessionId?: string;
}

/**
 * Disable 2FA on the customer's own account (FR-MFA-002, 007). Proof of control = current
 * password ALWAYS, plus a fresh second-factor code when the current session was not itself
 * 2FA-verified (`mfa_verified` flag, FR-MFA-018). Calling without the required code issues
 * a `disable` challenge (cooldown/cap-limited, FR-MFA-008) and returns 400 MFA_CODE_REQUIRED
 * — retrying without a code acts as the resend. On success every OTHER session is revoked
 * (BR-AUTH-5) and a confirmation notice is sent (FR-MFA-043).
 */
@Injectable()
export class DisableMfaUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
    @Inject(MFA_SETTINGS_REPOSITORY) private readonly settingsRepo: IMfaSettingsRepository,
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: IMfaChallengeRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(MFA_CONFIG) private readonly config: MfaConfig,
    private readonly issuer: MfaChallengeIssuer,
  ) {}

  async execute(command: DisableMfaCommand): Promise<{ enabled: false }> {
    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer || !customer.passwordHash) {
      throw new UnauthorizedException({ code: 'INVALID_PASSWORD', message: 'Incorrect password.' });
    }
    const matches = await this.hasher.compare(command.currentPassword, customer.passwordHash);
    if (!matches) {
      throw new UnauthorizedException({ code: 'INVALID_PASSWORD', message: 'Incorrect password.' });
    }

    const state =
      (await this.customerMfa.findByCustomerId(command.customerId)) ??
      CustomerMfa.none(command.customerId, now);
    if (!state.enabled) {
      throw new BadRequestException({ code: 'MFA_NOT_ENABLED', message: 'Two-factor authentication is not enabled.' });
    }

    // FR-MFA-002/018: a non-2FA-verified session must additionally present a fresh code.
    if (!command.sessionMfaVerified) {
      if (!command.code) {
        await this.issueDisableCode(customer, state, now);
        // issueDisableCode always throws (MFA_CODE_REQUIRED or a 429) — never falls through.
      } else {
        await this.verifyDisableCode(command.customerId, command.code, now);
      }
    }

    state.disable(now);
    await this.customerMfa.save(state);

    // FR-MFA-007 / BR-AUTH-5: revoke every other session; the current one survives.
    await this.sessions.revokeAllForCustomerExcept(
      command.customerId,
      command.currentSessionId ?? null,
      now,
    );

    // Notify the account owner that 2FA was turned off (best-effort, FR-MFA-043).
    const channel =
      state.preferredChannel === MfaChannel.SMS && customer.phone
        ? MfaChannel.SMS
        : customer.email
          ? MfaChannel.EMAIL
          : null;
    if (channel) {
      await this.dispatcher.dispatchMfaStateChange({
        channel,
        phone: channel === MfaChannel.SMS ? customer.phone : null,
        email: channel === MfaChannel.EMAIL ? customer.email : null,
        enabled: false,
      });
    }

    return { enabled: false };
  }

  /**
   * Issue + dispatch a fresh `disable` challenge, then signal the client that a code is
   * now required. Subject to the standard cooldown + hourly cap (FR-MFA-008) so repeated
   * calls act as a rate-limited resend, not a code-flooding vector.
   */
  private async issueDisableCode(
    customer: Customer,
    state: CustomerMfa,
    now: Date,
  ): Promise<never> {
    const settings = await this.settingsRepo.get();
    if (!settings) {
      throw new BadRequestException({ code: 'MFA_UNAVAILABLE', message: 'MFA is not available.' });
    }

    const contacts = {
      email: customer.email,
      emailVerified: customer.emailVerified,
      phone: customer.phone,
      phoneVerified: customer.phoneVerified,
    };
    const eligible = eligibleChannels(settings, contacts);
    if (eligible.length === 0) {
      throw new BadRequestException({
        code: 'NO_ELIGIBLE_CHANNEL',
        message: 'No verified delivery channel is available to receive the code.',
      });
    }

    // Cooldown (FR-MFA-008/016).
    const latest = await this.challenges.findLatestByCustomer(customer.id);
    if (latest) {
      const cooldown = settings.resendCooldownSeconds;
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < cooldown) {
        throw new HttpException(
          {
            code: 'MFA_COOLDOWN',
            message: 'Please wait before requesting another code.',
            retry_after: Math.ceil(cooldown - elapsed),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    // Hourly cap (FR-MFA-008/040).
    const since = new Date(now.getTime() - 3600 * 1000);
    const recent = await this.challenges.countCreatedSince(customer.id, since);
    if (recent >= this.config.resendHourlyCap) {
      throw new HttpException(
        { code: 'MFA_HOURLY_CAP', message: 'Too many code requests. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const channel = resolveChallengeChannel(settings, state.preferredChannel, eligible);
    const destination = destinationFor(channel, contacts) as string;
    await this.issuer.issue({
      customerId: customer.id,
      purpose: MfaChallengePurpose.DISABLE,
      channel,
      destination,
      ttlSeconds: settings.otpTtlSeconds,
      now,
    });

    throw new BadRequestException({
      code: 'MFA_CODE_REQUIRED',
      message: `A verification code was sent to ${maskDestination(channel, destination)}. Enter it to disable two-factor authentication.`,
    });
  }

  /** Verify the fresh `disable` code against the latest challenge (FR-MFA-002). */
  private async verifyDisableCode(customerId: string, code: string, now: Date): Promise<void> {
    const challenge = await this.challenges.findLatestByCustomerAndPurpose(
      customerId,
      MfaChallengePurpose.DISABLE,
    );
    if (!challenge || challenge.isConsumed()) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid or expired code.' });
    }
    const maxAttempts = (await this.settingsRepo.get())?.maxAttempts ?? 5;
    if (challenge.attemptsExhausted(maxAttempts)) {
      throw new HttpException(
        { code: 'MFA_LOCKED', message: 'Too many attempts. Request a new code.' },
        HTTP_LOCKED,
      );
    }
    if (challenge.isExpired(now)) {
      throw new BadRequestException({ code: 'CODE_EXPIRED', message: 'This code has expired.' });
    }

    const matches = await this.otp.compare(code, challenge.otpHash);
    if (!matches) {
      challenge.registerFailedAttempt();
      await this.challenges.save(challenge);
      if (challenge.attemptsExhausted(maxAttempts)) {
        throw new HttpException(
          { code: 'MFA_LOCKED', message: 'Too many attempts. Request a new code.' },
          HTTP_LOCKED,
        );
      }
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Invalid code.' });
    }

    challenge.consume(now);
    await this.challenges.save(challenge);
  }
}
