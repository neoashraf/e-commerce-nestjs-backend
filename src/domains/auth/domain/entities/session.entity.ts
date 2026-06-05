/** Pure domain entity for a refresh-token session (SRS §8, FR-AUTH-013–016). */
export class Session {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public refreshTokenHash: string,
    public readonly deviceLabel: string | null,
    public readonly expiresAt: Date,
    public revokedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  static issue(
    id: string,
    customerId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    now: Date,
    deviceLabel: string | null = null,
  ): Session {
    return new Session(id, customerId, refreshTokenHash, deviceLabel, expiresAt, null, now);
  }

  isActive(now: Date): boolean {
    return this.revokedAt === null && now.getTime() < this.expiresAt.getTime();
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  revoke(now: Date): void {
    if (this.revokedAt === null) {
      this.revokedAt = now;
    }
  }
}
