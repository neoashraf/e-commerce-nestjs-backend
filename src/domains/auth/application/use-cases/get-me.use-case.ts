import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';

export interface GetMeCommand {
  customerId: string;
}

/** Return the authenticated customer's profile (FR-AUTH-040). */
@Injectable()
export class GetMeUseCase {
  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository) {}

  async execute(command: GetMeCommand): Promise<Customer> {
    const customer = await this.customers.findById(command.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Account not found.' },
        HttpStatus.NOT_FOUND,
      );
    }
    return customer;
  }
}
