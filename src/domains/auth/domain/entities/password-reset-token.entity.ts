/**
 * Single-use, time-limited password-reset token (FR-AUTH-033). The raw token is emailed
 * via NOTIF; only its SHA-256 hash is stored. Mirrors EmailVerificationToken.
 */
export class PasswordResetToken {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public tokenHash: string,
    public expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  /** Issue a fresh token valid for `ttlSeconds`. */
  static issue(
    id: string,
    customerId: string,
    tokenHash: string,
    ttlSeconds: number,
    now: Date,
  ): PasswordResetToken {
    return new PasswordResetToken(
      id,
      customerId,
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
    return this.expiresAt.getTime() <= now.getTime();
  }

  isUsable(now: Date): boolean {
    return !this.isConsumed() && !this.isExpired(now);
  }

  consume(now: Date): void {
    this.consumedAt = now;
  }
}
