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
    /**
     * When the session's login lineage last verified a phone OTP (FR-AUTH-037): set at
     * OTP login/claim, carried over on refresh rotation. Null for password/Google logins.
     */
    public readonly otpVerifiedAt: Date | null = null,
    /**
     * True when the session was created through a completed second factor (FR-MFA-018);
     * carried over on refresh rotation. Consulted by FR-MFA-002 (disable gating).
     */
    public readonly mfaVerified: boolean = false,
  ) {}

  static issue(
    id: string,
    customerId: string,
    refreshTokenHash: string,
    expiresAt: Date,
    now: Date,
    deviceLabel: string | null = null,
    otpVerifiedAt: Date | null = null,
    mfaVerified = false,
  ): Session {
    return new Session(
      id,
      customerId,
      refreshTokenHash,
      deviceLabel,
      expiresAt,
      null,
      now,
      otpVerifiedAt,
      mfaVerified,
    );
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

  /** Freshness window (FR-AUTH-037): the session was OTP-verified < `windowSeconds` ago. */
  wasOtpVerifiedWithin(now: Date, windowSeconds: number): boolean {
    return (
      this.otpVerifiedAt !== null &&
      now.getTime() - this.otpVerifiedAt.getTime() < windowSeconds * 1000
    );
  }
}
