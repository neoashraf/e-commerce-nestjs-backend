import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';

import { Customer } from '../../domain/entities/customer.entity';
import { Gender } from '../../domain/enums/gender.enum';
import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../../domain/repositories/customer.repository.interface';
import { IssueEmailVerificationUseCase } from './issue-email-verification.use-case';

export interface UpdateProfileCommand {
  customerId: string;
  fullName?: string;
  gender?: Gender;
  dateOfBirth?: string; // ISO date (YYYY-MM-DD)
  email?: string;
  promoSmsOptIn?: boolean;
  promoEmailOptIn?: boolean;
}

export interface UpdateProfileResult {
  customer: Customer;
  emailChanged: boolean;
}

const MIN_AGE_YEARS = 13;

/**
 * Self-service profile update (FR-AUTH-040/041/060): name/gender/DOB + promo prefs; an
 * email change resets `email_verified` and re-sends verification; a DOB under 13 → 400;
 * an email already used by another active account → 409.
 */
@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    private readonly issueEmailVerification: IssueEmailVerificationUseCase,
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

    let emailChanged = false;
    if (command.email !== undefined && command.email.toLowerCase() !== (customer.email ?? '').toLowerCase()) {
      const existing = await this.customers.findActiveByEmail(command.email);
      if (existing && existing.id !== customer.id) {
        throw new HttpException(
          { code: 'EMAIL_IN_USE', message: 'That email is already in use by another account.' },
          HttpStatus.CONFLICT,
        );
      }
      customer.changeEmailPending(command.email, now);
      emailChanged = true;
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

    if (emailChanged && saved.email) {
      await this.issueEmailVerification.execute({
        customerId: saved.id,
        email: saved.email,
        fullName: saved.fullName,
      });
    }

    return { customer: saved, emailChanged };
  }

  private ageInYears(dob: Date, now: Date): number {
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
    return age;
  }
}
