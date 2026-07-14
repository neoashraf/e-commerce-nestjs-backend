/**
 * Short-lived login-continuation token (SRS §8, BR-MFA-5). Issued after a correct password on a
 * 2FA-required account; authorizes ONLY the second-factor submit/resend/channel calls and is never
 * interchangeable with a session token. Stored as a hash; bound to the challenge it continues.
 */
export class MfaPreAuth {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public challengeId: string,
    public readonly tokenHash: string,
    public readonly expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static issue(
    id: string,
    customerId: string,
    challengeId: string,
    tokenHash: string,
    ttlSeconds: number,
    now: Date,
  ): MfaPreAuth {
    return new MfaPreAuth(
      id,
      customerId,
      challengeId,
      tokenHash,
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

  isUsable(now: Date): boolean {
    return !this.isConsumed() && !this.isExpired(now);
  }

  /** Re-point the pre-auth token at a freshly issued challenge (resend / channel switch). */
  rebind(challengeId: string): void {
    this.challengeId = challengeId;
  }

  consume(now: Date): void {
    this.consumedAt = now;
  }
}
