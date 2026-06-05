import { CustomerStatus } from '../enums/customer-status.enum';
import { Gender } from '../enums/gender.enum';

/** Pure domain entity — no TypeORM/Nest decorators. */
export class Customer {
  constructor(
    public readonly id: string,
    public fullName: string,
    public phone: string,
    public email: string | null,
    public passwordHash: string | null,
    public isLightweight: boolean,
    public phoneVerified: boolean,
    public emailVerified: boolean,
    public gender: Gender | null,
    public dateOfBirth: Date | null,
    public promoSmsOptIn: boolean,
    public promoEmailOptIn: boolean,
    public status: CustomerStatus,
    public lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public deletedAt: Date | null,
  ) {}

  /** Factory for a phone-OTP registration (FR-AUTH-001, 006): phone verified, not lightweight. */
  static registerWithPhone(id: string, fullName: string, phone: string, now: Date): Customer {
    return new Customer(
      id,
      fullName,
      phone,
      null,
      null,
      false,
      true,
      false,
      null,
      null,
      false,
      false,
      CustomerStatus.ACTIVE,
      null,
      now,
      now,
      null,
    );
  }

  get isActive(): boolean {
    return this.status === CustomerStatus.ACTIVE && this.deletedAt === null;
  }

  markLoggedIn(now: Date): void {
    this.lastLoginAt = now;
    this.updatedAt = now;
  }
}
