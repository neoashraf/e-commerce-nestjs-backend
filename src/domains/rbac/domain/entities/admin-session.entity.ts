/** A refresh-token-backed admin session (SRS 16 §8 AdminSession). */
export class AdminSession {
  constructor(
    public readonly id: string,
    public readonly adminUserId: string,
    public refreshTokenHash: string,
    public deviceLabel: string | null,
    public expiresAt: Date,
    public revokedAt: Date | null,
    public readonly createdAt: Date,
    /** True when the login passed the 2FA step (mirrors FR-MFA-018); carried on rotation. */
    public readonly mfaVerified: boolean = false,
  ) {}

  static issue(
    id: string,
    adminUserId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    now: Date,
    deviceLabel: string | null = null,
    mfaVerified = false,
  ): AdminSession {
    return new AdminSession(
      id,
      adminUserId,
      refreshTokenHash,
      deviceLabel,
      expiresAt,
      null,
      now,
      mfaVerified,
    );
  }

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isActive(now: Date): boolean {
    return !this.isRevoked() && this.expiresAt.getTime() > now.getTime();
  }

  revoke(now: Date): void {
    this.revokedAt = now;
  }
}
