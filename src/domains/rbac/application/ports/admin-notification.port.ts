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

  dispatchPasswordReset(input: {
    email: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void>;
}

export const ADMIN_NOTIFICATION_DISPATCHER = Symbol('IAdminNotificationDispatcher');
