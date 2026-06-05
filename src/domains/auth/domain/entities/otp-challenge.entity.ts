import { OtpPurpose } from '../enums/otp-purpose.enum';

/** Pure domain entity for an outstanding OTP challenge (SRS §8, FR-AUTH-020–024). */
export class OtpChallenge {
  constructor(
    public readonly id: string,
    public readonly phone: string,
    public otpHash: string,
    public readonly purpose: OtpPurpose,
    public attempts: number,
    public readonly expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static issue(
    id: string,
    phone: string,
    otpHash: string,
    purpose: OtpPurpose,
    ttlSeconds: number,
    now: Date,
  ): OtpChallenge {
    return new OtpChallenge(
      id,
      phone,
      otpHash,
      purpose,
      0,
      new Date(now.getTime() + ttlSeconds * 1000),
      null,
      now,
    );
  }

  isConsumed(): boolean {
    return this.consumedAt !== null;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  attemptsExhausted(maxAttempts: number): boolean {
    return this.attempts >= maxAttempts;
  }

  registerFailedAttempt(): void {
    this.attempts += 1;
  }

  consume(now: Date): void {
    this.consumedAt = now;
  }

  /** Usable = not consumed, not expired, attempts left. */
  isUsable(now: Date, maxAttempts: number): boolean {
    return !this.isConsumed() && !this.isExpired(now) && !this.attemptsExhausted(maxAttempts);
  }
}
