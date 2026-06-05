import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import { BdPhone } from '../../domain/value-objects/bd-phone.vo';

export interface CreateLightweightAccountCommand {
  fullName: string;
  phone: string;
  email?: string | null;
  promoSmsOptIn?: boolean;
  promoEmailOptIn?: boolean;
}

export interface CreateLightweightAccountResult {
  customerId: string;
  wasExisting: boolean;
  isLightweight: boolean;
}

/**
 * Auto-creates a lightweight account at guest checkout (FR-AUTH-070), keyed by phone.
 *
 * Idempotent by phone (FR-AUTH-072, BR-AUTH-1): if the phone already maps to an account —
 * lightweight OR full — that account is returned unchanged and no duplicate is created.
 * `wasExisting`/`isLightweight` let the caller (CART checkout placement) decide whether to
 * prompt login (a full existing account) or proceed silently.
 */
@Injectable()
export class CreateLightweightAccountUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
  ) {}

  async execute(
    command: CreateLightweightAccountCommand,
  ): Promise<CreateLightweightAccountResult> {
    const fullName = command.fullName?.trim();
    if (!fullName || fullName.length < 2) {
      throw new BadRequestException({ code: 'INVALID_NAME', message: 'Full name is required.' });
    }

    // Normalize + validate the BD mobile to E.164 (FR-AUTH-005, AC3).
    const phone = BdPhone.toE164(command.phone);
    if (!phone) {
      throw new BadRequestException({
        code: 'INVALID_PHONE',
        message: 'A valid Bangladesh mobile number is required.',
      });
    }

    const email = command.email?.trim().toLowerCase() || null;

    // Idempotent by phone (FR-AUTH-072): reuse any existing active account, never duplicate.
    const existing = await this.customers.findActiveByPhone(phone);
    if (existing) {
      return {
        customerId: existing.id,
        wasExisting: true,
        isLightweight: existing.isLightweight,
      };
    }

    const customer = await this.customers.save(
      Customer.createLightweight(
        randomUUID(),
        fullName,
        phone,
        email,
        command.promoSmsOptIn ?? false,
        command.promoEmailOptIn ?? false,
        new Date(),
      ),
    );

    return { customerId: customer.id, wasExisting: false, isLightweight: true };
  }
}
