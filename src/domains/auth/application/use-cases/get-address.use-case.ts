import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Address } from '../../domain/entities/address.entity';
import {
  ADDRESS_REPOSITORY,
  IAddressRepository,
} from '../../domain/repositories/address.repository.interface';

export interface GetAddressQuery {
  customerId: string;
  addressId: string;
}

/**
 * Fetch one saved address, scoped to the owning customer (FR-AUTH-050). Used by CART checkout to
 * resolve a saved `address_id` into a full address for zone resolution + the order snapshot. Returns
 * 404 if the address does not exist or belongs to another customer (no cross-customer leakage).
 */
@Injectable()
export class GetAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute(query: GetAddressQuery): Promise<Address> {
    const address = await this.addresses.findById(query.addressId);
    if (!address || address.customerId !== query.customerId) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' });
    }
    return address;
  }
}
