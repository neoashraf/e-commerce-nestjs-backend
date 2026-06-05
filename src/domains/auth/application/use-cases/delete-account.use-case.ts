import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import {
  ISessionRepository,
  SESSION_REPOSITORY,
} from '../../domain/repositories/session.repository.interface';

export interface DeleteAccountCommand {
  customerId: string;
  confirm: boolean;
}

/**
 * Delete an account (FR-AUTH-080/081): soft-delete + anonymize PII, revoke all sessions.
 * Historical orders are retained (the row stays, FK intact) per BR-AUTH-9.
 */
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: ISessionRepository,
  ) {}

  async execute(command: DeleteAccountCommand): Promise<void> {
    if (!command.confirm) {
      throw new HttpException(
        { code: 'CONFIRMATION_REQUIRED', message: 'Account deletion must be confirmed.' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Account not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    customer.anonymizeAndSoftDelete(now);
    await this.customers.save(customer);
    await this.sessions.revokeAllForCustomer(customer.id, now);
  }
}
