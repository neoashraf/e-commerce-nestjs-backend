import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';

import { IPasswordHasher, PASSWORD_HASHER } from '../../../auth/application/ports/password-hasher.port';
import {
  INotificationDispatcher,
  NOTIFICATION_DISPATCHER,
} from '../../../auth/application/ports/notification-dispatcher.port';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../../auth/domain/repositories/customer.repository.interface';
import { CustomerMfa } from '../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import {
  CUSTOMER_MFA_REPOSITORY,
  ICustomerMfaRepository,
} from '../../domain/repositories/customer-mfa.repository.interface';

export interface DisableMfaCommand {
  customerId: string;
  currentPassword: string;
}

/**
 * Disable 2FA on the customer's own account (FR-MFA-002, 007). Proof of control = current password
 * (BR-MFA-7). A best-effort confirmation notice is sent (FR-MFA-043).
 */
@Injectable()
export class DisableMfaUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(CUSTOMER_MFA_REPOSITORY) private readonly customerMfa: ICustomerMfaRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
    @Inject(NOTIFICATION_DISPATCHER) private readonly dispatcher: INotificationDispatcher,
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
    state.disable(now);
    await this.customerMfa.save(state);

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
}
