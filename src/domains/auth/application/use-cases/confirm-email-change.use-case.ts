import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  EMAIL_CHANGE_REQUEST_REPOSITORY,
  IEmailChangeRequestRepository,
} from '../../domain/repositories/email-change-request.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import { IOtpService, OTP_SERVICE } from '../ports/otp-service.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import { maskEmail } from './request-email-change.use-case';

export interface ConfirmEmailChangeCommand {
  customerId: string;
  requestId: string;
  code: string;
  /** The session id (JWT `sid`) that made this request — spared by the revoke sweep. */
  currentSessionId?: string;
}

export interface ConfirmEmailChangeResult {
  email: string;
  emailVerified: true;
}

/**
 * Confirm a verify-before-attach email change (FR-AUTH-041/044/046): validates the code,
 * RE-checks uniqueness (409 if the address was claimed meanwhile — nothing attaches),
 * attaches the email already `email_verified = true`, notifies the previous address and
 * revokes every other session (BR-AUTH-5, the current one survives).
 */
@Injectable()
export class ConfirmEmailChangeUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(EMAIL_CHANGE_REQUEST_REPOSITORY)
    private readonly requests: IEmailChangeRequestRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(OTP_SERVICE) private readonly otp: IOtpService,
    @Inject(NOTIFICATION_DISPATCHER) private readonly notifier: INotificationDispatcher,
  ) {}

  async execute(command: ConfirmEmailChangeCommand): Promise<ConfirmEmailChangeResult> {
    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer || !customer.isActive) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Not authenticated.' });
    }

    const request = await this.requests.findById(command.requestId);
    if (!request || request.customerId !== customer.id || request.isConsumed()) {
      throw new BadRequestException({
        code: 'EMAIL_CHANGE_INVALID',
        message: 'Invalid or expired code. Request a new one.',
      });
    }
    if (request.isExpired(now)) {
      throw new BadRequestException({
        code: 'EMAIL_CHANGE_EXPIRED',
        message: 'This code has expired. Request a new one.',
      });
    }

    const matches = await this.otp.compare(command.code, request.tokenHash);
    if (!matches) {
      throw new BadRequestException({
        code: 'EMAIL_CHANGE_INVALID',
        message: 'Invalid or expired code. Request a new one.',
      });
    }

    // Re-check uniqueness at confirm time (FR-AUTH-044, edge 5): claimed meanwhile → 409,
    // nothing attaches; the pending request stays available until it expires.
    const existing = await this.customers.findActiveByEmail(request.newEmail);
    if (existing && existing.id !== customer.id) {
      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'That email was claimed by another account in the meantime.',
      });
    }

    const previousEmail = customer.email;
    request.consume(now);
    await this.requests.save(request);

    customer.attachVerifiedEmail(request.newEmail, now);
    await this.customers.save(customer);

    // BR-AUTH-5 / FR-AUTH-046: revoke every other session; the current one survives.
    await this.sessions.revokeAllForCustomerExcept(
      customer.id,
      command.currentSessionId ?? null,
      now,
    );

    // FR-AUTH-046: best-effort notice to the previous address (if there was one).
    if (previousEmail && previousEmail.toLowerCase() !== request.newEmail.toLowerCase()) {
      await this.notifier.dispatchEmailChangedNotice({
        email: previousEmail,
        fullName: customer.fullName,
        newEmailMasked: maskEmail(request.newEmail),
      });
    }

    return { email: request.newEmail, emailVerified: true };
  }
}
