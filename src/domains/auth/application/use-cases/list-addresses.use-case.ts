import { Inject, Injectable } from '@nestjs/common';

import { Address } from '../../domain/entities/address.entity';
import {
  ADDRESS_REPOSITORY,
  IAddressRepository,
} from '../../domain/repositories/address.repository.interface';

export interface ListAddressesQuery {
  customerId: string;
}

/** List a customer's saved addresses, default-first (FR-AUTH-050). */
@Injectable()
export class ListAddressesUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  execute(query: ListAddressesQuery): Promise<Address[]> {
    return this.addresses.findByCustomerId(query.customerId);
  }
}
