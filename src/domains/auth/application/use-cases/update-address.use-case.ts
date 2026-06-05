import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Address } from '../../domain/entities/address.entity';
import {
  ADDRESS_REPOSITORY,
  IAddressRepository,
} from '../../domain/repositories/address.repository.interface';
import { BdPhone } from '../../domain/value-objects/bd-phone.vo';
import { ZONE_RESOLVER, ZoneResolverPort } from '../ports/zone-resolver.port';
import { normalizePostalCode } from './create-address.use-case';

export interface UpdateAddressCommand {
  customerId: string;
  addressId: string;
  recipientName?: string;
  recipientPhone?: string;
  addressLine?: string;
  area?: string;
  district?: string;
  division?: string;
  postalCode?: string | null;
  isDefault?: boolean;
}

/**
 * Edit a saved address (FR-AUTH-053). Scoped to the caller (404 otherwise). Re-resolves the
 * delivery zone when district/area change (unserviceable → `400`); promoting to default clears the
 * prior default (FR-AUTH-052/BR-AUTH-6).
 */
@Injectable()
export class UpdateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
    @Inject(ZONE_RESOLVER) private readonly zoneResolver: ZoneResolverPort,
  ) {}

  async execute(cmd: UpdateAddressCommand): Promise<Address> {
    const address = await this.addresses.findById(cmd.addressId);
    if (!address || address.customerId !== cmd.customerId) {
      throw new NotFoundException({ code: 'ADDRESS_NOT_FOUND', message: 'Address not found.' });
    }

    const now = new Date();

    if (cmd.recipientName !== undefined) {
      const recipientName = cmd.recipientName.trim();
      if (recipientName.length < 2 || recipientName.length > 120) {
        throw new BadRequestException({
          code: 'INVALID_RECIPIENT_NAME',
          message: 'Recipient name must be 2–120 characters.',
        });
      }
      address.recipientName = recipientName;
    }

    if (cmd.recipientPhone !== undefined) {
      const recipientPhone = BdPhone.toE164(cmd.recipientPhone);
      if (!recipientPhone) {
        throw new BadRequestException({
          code: 'INVALID_PHONE',
          message: 'A valid Bangladesh mobile number is required for the recipient.',
        });
      }
      address.recipientPhone = recipientPhone;
    }

    if (cmd.addressLine !== undefined) {
      const addressLine = cmd.addressLine.trim();
      if (!addressLine || addressLine.length > 255) {
        throw new BadRequestException({
          code: 'INVALID_ADDRESS_LINE',
          message: 'Address line is required (max 255 characters).',
        });
      }
      address.addressLine = addressLine;
    }

    if (cmd.area !== undefined) address.area = cmd.area.trim();
    if (cmd.district !== undefined) address.district = cmd.district.trim();
    if (cmd.division !== undefined) address.division = cmd.division.trim();
    if (cmd.postalCode !== undefined) address.postalCode = normalizePostalCode(cmd.postalCode);

    if (!address.area || !address.district || !address.division) {
      throw new BadRequestException({
        code: 'MISSING_GEO_FIELD',
        message: 'Division, district, and area are required.',
      });
    }

    // Re-resolve the zone whenever the geo that drives it changes (FR-AUTH-051).
    if (cmd.district !== undefined || cmd.area !== undefined) {
      const resolution = await this.zoneResolver.resolveZone(address.district, address.area);
      if (!resolution.serviceable || !resolution.zone) {
        throw new BadRequestException({
          code: 'UNSERVICEABLE_AREA',
          message: 'This area is not serviceable; the delivery zone could not be resolved.',
        });
      }
      address.deliveryZone = resolution.zone;
    }

    // Promote to default (FR-AUTH-052): clear the prior default, then set this one.
    if (cmd.isDefault === true && !address.isDefault) {
      await this.addresses.clearDefault(cmd.customerId);
      address.markDefault(now);
    }

    address.updatedAt = now;
    return this.addresses.save(address);
  }
}
