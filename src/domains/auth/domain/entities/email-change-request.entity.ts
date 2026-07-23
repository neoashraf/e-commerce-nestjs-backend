/**
 * Pending verify-before-attach email change (SRS 01 §8, FR-AUTH-041/044): the requested
 * address lives here — NOT on the account — until the single-use code sent to it is
 * confirmed. Only the code's hash is stored; requests expire after 15 minutes.
 */
export class EmailChangeRequest {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public readonly newEmail: string,
    public tokenHash: string,
    public expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  /** Issue a fresh pending change valid for `ttlSeconds`. */
  static issue(
    id: string,
    customerId: string,
    newEmail: string,
    tokenHash: string,
    ttlSeconds: number,
    now: Date,
  ): EmailChangeRequest {
    return new EmailChangeRequest(
      id,
      customerId,
      newEmail,
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
