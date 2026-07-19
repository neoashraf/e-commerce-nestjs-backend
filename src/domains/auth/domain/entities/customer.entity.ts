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

  /**
   * Factory for a Google sign-in account (FR-AUTH-002 family): keyed by the Google-verified email,
   * so `email_verified = true`, no password, not lightweight, phone empty until the user adds one.
   * Promotional opt-ins default opted-out (FR-AUTH-062).
   */
  static registerWithGoogle(id: string, fullName: string, email: string, now: Date): Customer {
    return new Customer(
      id,
      fullName,
      '',
      email,
      null,
      false,
      false,
      true,
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

  /** Set (or reset) the password hash (FR-AUTH-030/033). Callers revoke sessions separately. */
  setPassword(passwordHash: string, now: Date): void {
    this.passwordHash = passwordHash;
    this.updatedAt = now;
  }

  /** Activate a lightweight guest account (FR-AUTH-071): unlock full login, verify phone. */
  activate(now: Date): void {
    this.isLightweight = false;
    this.phoneVerified = true;
    this.lastLoginAt = now;
    this.updatedAt = now;
  }

  /** Update editable profile fields (FR-AUTH-040). Only provided fields change. */
  updateProfile(
    fields: { fullName?: string; gender?: Gender | null; dateOfBirth?: Date | null },
    now: Date,
  ): void {
    if (fields.fullName !== undefined) this.fullName = fields.fullName;
    if (fields.gender !== undefined) this.gender = fields.gender;
    if (fields.dateOfBirth !== undefined) this.dateOfBirth = fields.dateOfBirth;
    this.updatedAt = now;
  }

  /**
   * Attach an email that has just been verified via the change-confirm flow
   * (FR-AUTH-041/044): lands on the account already `email_verified = true`.
   */
  attachVerifiedEmail(email: string, now: Date): void {
    this.email = email;
    this.emailVerified = true;
    this.updatedAt = now;
  }

  /** Replace the phone after OTP verification of the NEW number (FR-AUTH-042). */
  setPhone(phone: string, now: Date): void {
    this.phone = phone;
    this.phoneVerified = true;
    this.updatedAt = now;
  }

  /** Update promotional opt-ins (FR-AUTH-060/061). Transactional messages are unaffected. */
  updatePromoPreferences(prefs: { sms?: boolean; email?: boolean }, now: Date): void {
    if (prefs.sms !== undefined) this.promoSmsOptIn = prefs.sms;
    if (prefs.email !== undefined) this.promoEmailOptIn = prefs.email;
    this.updatedAt = now;
  }

  /**
   * Soft-delete + anonymize (FR-AUTH-080/081, BR-AUTH-9): clears PII and frees the
   * phone/email for re-registration (the active-uniqueness indexes exclude soft-deleted
   * rows) while the row itself is retained so historical orders keep their FK.
   */
  anonymizeAndSoftDelete(now: Date): void {
    this.fullName = 'Deleted User';
    this.email = null;
    this.phone = '';
    this.passwordHash = null;
    this.gender = null;
    this.dateOfBirth = null;
    this.phoneVerified = false;
    this.emailVerified = false;
    this.promoSmsOptIn = false;
    this.promoEmailOptIn = false;
    this.status = CustomerStatus.DELETED;
    this.deletedAt = now;
    this.updatedAt = now;
  }
}
