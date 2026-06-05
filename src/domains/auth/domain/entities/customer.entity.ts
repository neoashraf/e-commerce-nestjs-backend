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
    public failedLoginAttempts: number,
    public lockedUntil: Date | null,
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
      0,
      null,
      now,
      now,
      null,
    );
  }

  /**
   * Factory for an email + password registration (FR-AUTH-002, 006): email present but
   * unverified, phone empty until added, not lightweight. Phone is stored empty for a
   * pure-email account (the address book / phone-change flows can populate it later).
   */
  static registerWithEmail(
    id: string,
    fullName: string,
    email: string,
    passwordHash: string,
    promoEmailOptIn: boolean,
    now: Date,
  ): Customer {
    return new Customer(
      id,
      fullName,
      '',
      email,
      passwordHash,
      false,
      false,
      false,
      null,
      null,
      false,
      promoEmailOptIn,
      CustomerStatus.ACTIVE,
      null,
      0,
      null,
      now,
      now,
      null,
    );
  }

  /**
   * Factory for a guest-checkout lightweight account (FR-AUTH-070): keyed by phone,
   * no password, `is_lightweight = true`, `phone_verified = false`. Promotional opt-ins
   * default opted-out unless the caller passes consent (FR-AUTH-062). Claimable later
   * via OTP (FR-AUTH-071).
   */
  static createLightweight(
    id: string,
    fullName: string,
    phone: string,
    email: string | null,
    promoSmsOptIn: boolean,
    promoEmailOptIn: boolean,
    now: Date,
  ): Customer {
    return new Customer(
      id,
      fullName,
      phone,
      email,
      null,
      true,
      false,
      false,
      null,
      null,
      promoSmsOptIn,
      promoEmailOptIn,
      CustomerStatus.ACTIVE,
      null,
      0,
      null,
      now,
      now,
      null,
    );
  }

  get isActive(): boolean {
    return this.status === CustomerStatus.ACTIVE && this.deletedAt === null;
  }

  /** Temporary brute-force lockout is active (FR-AUTH-012). */
  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > now.getTime();
  }

  /** Register a failed email/password attempt; lock the account once the threshold is hit. */
  registerFailedLogin(now: Date, threshold: number, lockMinutes: number): void {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= threshold) {
      this.lockedUntil = new Date(now.getTime() + lockMinutes * 60_000);
      this.failedLoginAttempts = 0;
    }
    this.updatedAt = now;
  }

  /** Clear the failed-attempt counter + lockout on a successful login. */
  registerSuccessfulLogin(now: Date): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
    this.lastLoginAt = now;
    this.updatedAt = now;
  }

  markLoggedIn(now: Date): void {
    this.lastLoginAt = now;
    this.updatedAt = now;
  }

  /** Confirm an email-verification link (FR-AUTH-043). */
  markEmailVerified(now: Date): void {
    this.emailVerified = true;
    this.updatedAt = now;
  }
}
