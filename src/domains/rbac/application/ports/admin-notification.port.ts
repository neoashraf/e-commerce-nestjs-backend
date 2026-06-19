import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';

/**
 * Outbound port to NOTIF (call-only — FR-RBAC-002, 007, 010). RBAC triggers delivery;
 * templates/delivery are owned by NOTIF. Implementations must not throw on delivery
 * failure for the 2FA/reset paths (a generic success is still returned — §12.12).
 */
export interface IAdminNotificationDispatcher {
  dispatchTwofaCode(input: {
    channel: TwofaChannel;
    phone: string | null;
    email: string;
    code: string;
    ttlMinutes: number;
  }): Promise<void>;

  /** Accept-invitation email (FR-RBAC-010) — sends the `admin.invite` template (set-password link). */
  dispatchAdminInvite(input: {
    email: string;
    fullName: string;
    inviteUrl: string;
  }): Promise<void>;

  /** Forgot/reset-password email (FR-RBAC-007) — sends the `admin.password_reset` template. */
  dispatchPasswordReset(input: {
    email: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void>;
}

export const ADMIN_NOTIFICATION_DISPATCHER = Symbol('IAdminNotificationDispatcher');
