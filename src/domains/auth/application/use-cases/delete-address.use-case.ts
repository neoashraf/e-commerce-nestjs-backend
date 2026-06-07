import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  ADDRESS_REPOSITORY,
  IAddressRepository,
} from '../../domain/repositories/address.repository.interface';

export interface DeleteAddressCommand {
  customerId: string;
  addressId: string;
}

/**
 * Remove a saved address (FR-AUTH-053). Scoped to the caller (404 otherwise). Deleting the default
 * promotes the most-recently-used remaining address to default; deleting the last leaves none
 * (BR-AUTH-6).
 */
@Injectable()
export class DeleteAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
  ) {}

  async execute(cmd: DeleteAddressCommand): Promise<void> {
    const address = await this.addresses.findById(cmd.addressId);
    if (!address || address.customerId !== cmd.customerId) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' });
    }

    const wasDefault = address.isDefault;
    await this.addresses.softDelete(address.id);

    if (!wasDefault) return;

    // Promote the most-recently-used remaining address (findByCustomerId orders
    // last-used-first once no default remains).
    const remaining = await this.addresses.findByCustomerId(cmd.customerId);
    const promote = remaining[0];
    if (!promote) return;

    promote.markDefault(new Date());
    await this.addresses.save(promote);
  }
}
