/**
 * Single-use admin password-reset token (FR-RBAC-007). Support state for the
 * documented forgot/reset flow; the raw token is emailed, only its hash is stored.
 */
export class PasswordResetToken {
  constructor(
    public readonly id: string,
    public readonly adminUserId: string,
    public tokenHash: string,
    public expiresAt: Date,
    public usedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  isUsed(): boolean {
    return this.usedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  isUsable(now: Date): boolean {
    return !this.isUsed() && !this.isExpired(now);
  }

  use(now: Date): void {
    this.usedAt = now;
  }
}
