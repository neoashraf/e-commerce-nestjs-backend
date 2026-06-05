import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { isValidCustomerPassword } from '../../domain/password-policy';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import { IPasswordHasher, PASSWORD_HASHER } from '../ports/password-hasher.port';

export interface ChangePasswordCommand {
  customerId: string;
  currentPassword: string;
  newPassword: string;
}

/**
 * Change password while logged in (FR-AUTH-032): the current password must match
 * (`401` otherwise) and the new password must satisfy the policy (`400` otherwise).
 */
@Injectable()
export class ChangePasswordUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: IPasswordHasher,
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
  }
}
