import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { Gender } from '../../domain/enums/gender.enum';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';

export interface UpdateProfileCommand {
  customerId: string;
  fullName?: string;
  gender?: Gender;
  dateOfBirth?: string; // ISO date (YYYY-MM-DD)
  promoSmsOptIn?: boolean;
  promoEmailOptIn?: boolean;
}

export interface UpdateProfileResult {
  customer: Customer;
}

const MIN_AGE_YEARS = 13;

/**
 * Self-service profile update (FR-AUTH-040/060): name/gender/DOB + promo prefs; a DOB
 * under 13 → 400. `email` is NO LONGER accepted here (changed 2026-07-19): email
 * add/change goes through the verify-before-attach pair (FR-AUTH-041) so an unverified
 * address is never attached.
 */
@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
  ) {}

  async execute(command: UpdateProfileCommand): Promise<UpdateProfileResult> {
    const now = new Date();
    const customer = await this.customers.findById(command.customerId);
    if (!customer) {
      throw new HttpException(
        { code: 'CUSTOMER_NOT_FOUND', message: 'Account not found.' },
        HttpStatus.NOT_FOUND,
      );
    }

    let dateOfBirth: Date | undefined;
    if (command.dateOfBirth !== undefined) {
      const dob = new Date(command.dateOfBirth);
      if (Number.isNaN(dob.getTime())) {
        throw new HttpException(
          { code: 'INVALID_DOB', message: 'Invalid date of birth.' },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (this.ageInYears(dob, now) < MIN_AGE_YEARS) {
        throw new HttpException(
          { code: 'UNDERAGE', message: `You must be at least ${MIN_AGE_YEARS} years old.` },
          HttpStatus.BAD_REQUEST,
        );
      }
      dateOfBirth = dob;
    }

    customer.updateProfile(
      { fullName: command.fullName, gender: command.gender, dateOfBirth },
      now,
    );
    if (command.promoSmsOptIn !== undefined || command.promoEmailOptIn !== undefined) {
      customer.updatePromoPreferences(
        { sms: command.promoSmsOptIn, email: command.promoEmailOptIn },
        now,
      );
    }

    const saved = await this.customers.save(customer);
    return { customer: saved };
  }

  private ageInYears(dob: Date, now: Date): number {
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age;
  }
}
