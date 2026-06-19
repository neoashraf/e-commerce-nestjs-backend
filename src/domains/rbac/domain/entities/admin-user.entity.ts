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

  /** Self-service profile edit (FR-RBAC-008). Email is immutable and not updatable here. */
  updateProfile(fields: { fullName?: string; phone?: string | null }, now: Date): void {
    if (fields.fullName !== undefined) this.fullName = fields.fullName;
    if (fields.phone !== undefined) this.phone = fields.phone;
    this.updatedAt = now;
  }

  setPassword(passwordHash: string, now: Date): void {
    this.passwordHash = passwordHash;
    this.updatedAt = now;
  }

  /**
   * Accept an invitation (FR-RBAC-010, SRS §7.1): a `pending` invitee who has just set
   * a password becomes `active` and can log in. No-op for any non-pending status.
   */
  activate(now: Date): void {
    if (this.status === AdminUserStatus.PENDING) {
      this.status = AdminUserStatus.ACTIVE;
      this.updatedAt = now;
    }
  }

  /** Enable 2FA on a chosen channel (FR-RBAC-008). `sms` requires a stored phone (checked by caller). */
  enableTwofa(channel: TwofaChannel, now: Date): void {
    this.twofaEnabled = true;
    this.twofaChannel = channel;
    this.updatedAt = now;
  }

  /** Disable 2FA (FR-RBAC-008). Blocked for Super Admin by the caller (mandatory 2FA). */
  disableTwofa(now: Date): void {
    this.twofaEnabled = false;
    this.twofaChannel = null;
    this.updatedAt = now;
  }

  /** Reassign role (FR-RBAC-012). Floor/self-action invariants are enforced by the caller. */
  changeRole(roleId: string, now: Date): void {
    this.roleId = roleId;
    this.updatedAt = now;
  }

  /** Suspend (FR-RBAC-013): block future login; caller revokes sessions. */
  suspend(now: Date): void {
    this.status = AdminUserStatus.SUSPENDED;
    this.updatedAt = now;
  }

  /** Reactivate a suspended account (FR-RBAC-014). */
  reactivate(now: Date): void {
    this.status = AdminUserStatus.ACTIVE;
    this.updatedAt = now;
  }

  /** Soft-delete (FR-RBAC-015): excluded from default lists, retained for audit. */
  softDelete(now: Date): void {
    this.status = AdminUserStatus.DELETED;
    this.deletedAt = now;
    this.updatedAt = now;
  }
}
