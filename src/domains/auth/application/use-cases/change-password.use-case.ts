import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { isValidCustomerPassword } from '../../domain/password-policy';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../ports/notification-dispatcher.port';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';

export interface ChangePasswordCommand {
  customerId: string;
  currentPassword: string;
  newPassword: string;
  /** The session id (JWT `sid`) that made this request — spared by the revoke sweep. */
  currentSessionId?: string;
}

/**
 * Change password while logged in (FR-AUTH-032, 038): the current password must match
 * (`401` otherwise) and the new password must satisfy the policy (`400` otherwise). On
 * success every OTHER active session is revoked and a `auth.password_changed`
 * notification is dispatched to the account's verified channels (BR-AUTH-5).
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
    @Inject(NOTIFICATION_DISPATCHER) private readonly notifier: INotificationDispatcher,
  ) {}

  async execute(command: ChangePasswordCommand): Promise<void> {
    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer || !customer.passwordHash) {
      throw new HttpException(
        { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const ok = await this.hasher.compare(command.currentPassword, customer.passwordHash);
    if (!ok) {
      throw new HttpException(
        { code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!isValidCustomerPassword(command.newPassword)) {
      throw new HttpException(
        {
          code: 'WEAK_PASSWORD',
          message: 'Password must be at least 8 characters and include a letter and a number.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    customer.setPassword(await this.hasher.hash(command.newPassword), now);
    await this.customers.save(customer);

    // BR-AUTH-5: revoke every other session; keep the current one alive.
    await this.sessions.revokeAllForCustomerExcept(
      customer.id,
      command.currentSessionId ?? null,
      now,
    );

    // FR-AUTH-038: best-effort notification to verified channels.
    await this.notifier.dispatchPasswordChanged({
      email: customer.emailVerified ? customer.email : null,
      phone: customer.phoneVerified ? customer.phone : null,
      fullName: customer.fullName,
      event: 'password_changed',
    });
  }
}
