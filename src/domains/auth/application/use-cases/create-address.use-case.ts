import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { Address } from '../../domain/entities/address.entity';
import {
  ADDRESS_REPOSITORY,
  IAddressRepository,
} from '../../domain/repositories/address.repository.interface';
import { BdPhone } from '../../domain/value-objects/bd-phone.vo';
import { ZONE_RESOLVER, ZoneResolverPort } from '../ports/zone-resolver.port';

export interface CreateAddressCommand {
  customerId: string;
  recipientName: string;
  recipientPhone: string;
  addressLine: string;
  area: string;
  district: string;
  division: string;
  postalCode?: string | null;
  isDefault?: boolean;
}

export interface CreateAddressResult {
  id: string;
  isDefault: boolean;
}

/**
 * Create a saved delivery address (FR-AUTH-050/051/052). Resolves the delivery zone via CART
 * (unserviceable → `400`), enforces the single-default invariant (BR-AUTH-6) and auto-defaults the
 * first-ever address.
 */
@Injectable()
export class CreateAddressUseCase {
  constructor(
    @Inject(ADDRESS_REPOSITORY) private readonly addresses: IAddressRepository,
    @Inject(ZONE_RESOLVER) private readonly zoneResolver: ZoneResolverPort,
  ) {}

  async execute(cmd: CreateAddressCommand): Promise<CreateAddressResult> {
    const recipientName = cmd.recipientName?.trim();
    if (!recipientName || recipientName.length < 2 || recipientName.length > 120) {
      throw new BadRequestException({
        code: 'INVALID_RECIPIENT_NAME',
        message: 'Recipient name must be 2–120 characters.',
      });
    }

    const recipientPhone = BdPhone.toE164(cmd.recipientPhone);
    if (!recipientPhone) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'A valid Bangladesh mobile number is required for the recipient.',
      });
    }

    const addressLine = cmd.addressLine?.trim();
    if (!addressLine || addressLine.length > 255) {
      throw new BadRequestException({
        code: 'INVALID_ADDRESS_LINE',
        message: 'Address line is required (max 255 characters).',
      });
    }

    const area = cmd.area?.trim();
    const district = cmd.district?.trim();
    const division = cmd.division?.trim();
    if (!area || !district || !division) {
      throw new BadRequestException({
        code: 'MISSING_GEO_FIELD',
        message: 'Division, district, and area are required.',
      });
    }

    const postalCode = normalizePostalCode(cmd.postalCode);

    // Resolve the delivery zone authoritatively via CART (FR-AUTH-051) — never trust a
    // client-supplied zone. An area absent from the dataset is unserviceable.
    const resolution = await this.zoneResolver.resolveZone(district, area);
    if (!resolution.serviceable || !resolution.zone) {
      throw new BadRequestException({
        code: 'UNSERVICEABLE_AREA',
        message: 'This area is not serviceable; the delivery zone could not be resolved.',
      });
    }

    // First-ever address auto-defaults; otherwise honour the explicit flag (FR-AUTH-052).
    const existing = await this.addresses.findByCustomerId(cmd.customerId);
    const makeDefault = existing.length === 0 ? true : cmd.isDefault === true;
    if (makeDefault) {
      await this.addresses.clearDefault(cmd.customerId);
    }

    const now = new Date();
    const address = Address.create(
      randomUUID(),
      cmd.customerId,
      {
        recipientName,
        recipientPhone,
        addressLine,
        area,
        district,
        division,
        postalCode,
        deliveryZone: resolution.zone,
      },
      makeDefault,
      now,
    );

    const saved = await this.addresses.save(address);
    return { id: saved.id, isDefault: saved.isDefault };
  }
}

/** A BD postal code is exactly 4 digits when supplied (SRS 01 §11); blank → null. */
export function normalizePostalCode(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (!/^\d{4}$/.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_POSTAL_CODE',
      message: 'Postal code must be 4 digits.',
    });
  }
  return value;
}
