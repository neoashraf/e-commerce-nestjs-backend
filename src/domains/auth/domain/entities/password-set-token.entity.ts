/**
 * Single-use, time-limited first-password set token (FR-AUTH-037): issued instead of a
 * fresh OTP when the session itself was OTP-verified inside the freshness window. The
 * raw `pst_…` value goes to the client; only its SHA-256 hash is stored. Mirrors
 * PasswordResetToken.
 */
export class PasswordSetToken {
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
  ): PasswordSetToken {
    return new PasswordSetToken(
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
