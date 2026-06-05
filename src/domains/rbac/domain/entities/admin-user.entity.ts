import { AdminUserStatus } from '../enums/admin-user-status.enum';
import { TwofaChannel } from '../enums/twofa-channel.enum';

/**
 * Admin staff account (SRS 16 §8 AdminUser). Pure domain entity — no framework imports.
 * `failedLoginAttempts` / `lockedUntil` back the brute-force lockout (FR-RBAC-003).
 */
export class AdminUser {
  constructor(
    public readonly id: string,
    public fullName: string,
    public readonly email: string,
    public phone: string | null,
    public passwordHash: string | null,
    public roleId: string,
    public twofaEnabled: boolean,
    public twofaChannel: TwofaChannel | null,
    public status: AdminUserStatus,
    public failedLoginAttempts: number,
    public lockedUntil: Date | null,
    public lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public deletedAt: Date | null,
  ) {}

  isActive(): boolean {
    return this.status === AdminUserStatus.ACTIVE && this.deletedAt === null;
  }

  isLocked(now: Date): boolean {
    return this.lockedUntil !== null && this.lockedUntil.getTime() > now.getTime();
  }

  /** Register a failed credential attempt; lock the account once the threshold is hit. */
  registerFailedLogin(now: Date, threshold: number, lockMinutes: number): void {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= threshold) {
      this.lockedUntil = new Date(now.getTime() + lockMinutes * 60_000);
      this.failedLoginAttempts = 0;
    }
    this.updatedAt = now;
  }

  registerSuccessfulLogin(now: Date): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = null;
    this.lastLoginAt = now;
    this.updatedAt = now;
  }
}
