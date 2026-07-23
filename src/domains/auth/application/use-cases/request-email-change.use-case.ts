import { randomUUID } from 'crypto';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { EmailChangeRequest } from '../../domain/entities/email-change-request.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  EMAIL_CHANGE_REQUEST_REPOSITORY,
  IEmailChangeRequestRepository,
} from '../../domain/repositories/email-change-request.repository.interface';
import { AUTH_CONFIG, AuthConfig } from '../ports/auth-config.port';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';

export interface RequestEmailChangeCommand {
  customerId: string;
  newEmail: string;
}

export interface RequestEmailChangeResult {
  requestId: string;
  /** Masked form of the pending address, e.g. `n**@example.com`. */
  sentTo: string;
  expiresIn: number;
}

/** Mask an email for display: first local char + `**` + domain (contract 01). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${(local ?? '').slice(0, 1)}**@${domain ?? ''}`;
}

/**
 * Start a verify-before-attach email change (FR-AUTH-041/044): the address is stored as
 * a pending EmailChangeRequest — the account row is NOT touched — and a single-use code
 * goes to that inbox. Uniqueness is pre-checked here (and re-checked at confirm).
 */
@Injectable()
export class RequestEmailChangeUseCase {
  private readonly logger = new Logger(RequestEmailChangeUseCase.name);

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(EMAIL_CHANGE_REQUEST_REPOSITORY)
    private readonly requests: IEmailChangeRequestRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async execute(command: RequestEmailChangeCommand): Promise<RequestEmailChangeResult> {
    const now = new Date();
    const newEmail = command.newEmail.trim().toLowerCase();

    const customer = await this.customers.findById(command.customerId);
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not authenticated.' });
    }

    // Uniqueness pre-check (FR-AUTH-041): the address must not belong to another account.
    const existing = await this.customers.findActiveByEmail(newEmail);
    if (existing && existing.id !== customer.id) {
      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'That email is already in use by another account.',
      });
    }

    // Request cooldown (contract 01: 429).
    const latest = await this.requests.findLatestByCustomer(customer.id);
    if (latest) {
      const elapsed = (now.getTime() - latest.createdAt.getTime()) / 1000;
      if (elapsed < this.config.emailChangeResendCooldownSeconds) {
        throw new HttpException(
          {
            code: 'EMAIL_CHANGE_COOLDOWN',
            message: 'Please wait before requesting another code.',
            retry_after: Math.ceil(this.config.emailChangeResendCooldownSeconds - elapsed),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Only the latest pending change is valid.
    await this.requests.consumeOutstandingForCustomer(customer.id, now);

    const code = this.otp.generateCode();
    const request = EmailChangeRequest.issue(
      randomUUID(),
      customer.id,
      newEmail,
      await this.otp.hash(code),
      this.config.emailChangeTtlSeconds,
      now,
    );
    await this.requests.save(request);

    try {
      await this.dispatcher.dispatchEmailChangeCode({
        email: newEmail,
        fullName: customer.fullName,
        code,
        ttlMinutes: Math.ceil(this.config.emailChangeTtlSeconds / 60),
      });
    } catch (err) {
      // Same posture as the email-verify sender: the pending row is issued; the customer
      // can re-request after the cooldown. Log and continue.
      this.logger.error(
        `email-change code dispatch failed for ${maskEmail(newEmail)}: ${(err as Error).message}`,
      );
    }

    return {
      requestId: request.id,
      sentTo: maskEmail(newEmail),
      expiresIn: this.config.emailChangeTtlSeconds,
    };
  }
}
