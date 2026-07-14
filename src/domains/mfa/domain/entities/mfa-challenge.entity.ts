import { MfaChannel } from '../enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../enums/mfa-challenge-purpose.enum';

/**
 * A pending second-factor OTP (SRS §8). Mirrors the AUTH OtpChallenge mechanics (single-use,
 * hashed, TTL, attempt cap) but carries the channel + destination (phone or email) and is bound
 * to a customer + purpose (login_2fa | enable). Bound to one login attempt via the pre-auth token.
 */
export class MfaChallenge {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly purpose: MfaChallengePurpose,
    public readonly channel: MfaChannel,
    /** Phone (E.164) or email the code was sent to — used for dispatch, never returned raw. */
    public readonly destination: string,
    public otpHash: string,
    public attempts: number,
    public readonly expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static issue(
    id: string,
    customerId: string,
    purpose: MfaChallengePurpose,
    channel: MfaChannel,
    destination: string,
    otpHash: string,
    ttlSeconds: number,
    now: Date,
  ): MfaChallenge {
    return new MfaChallenge(
      id,
      customerId,
      purpose,
      channel,
      destination,
      otpHash,
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
}
