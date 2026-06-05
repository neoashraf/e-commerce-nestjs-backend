export interface DispatchOtpCommand {
  phone: string;
  code: string;
  purpose: 'register' | 'login' | 'phone_change';
}

export interface DispatchEmailVerificationCommand {
  email: string;
  fullName: string;
  /** Raw verification token to embed in the link. */
  token: string;
  ttlMinutes: number;
}

export interface DispatchPasswordResetCommand {
  email: string;
  fullName: string;
  /** Raw reset token to embed in the link. */
  token: string;
  ttlMinutes: number;
}

/**
 * Outbound port to the NOTIF module. AUTH only triggers delivery (FR-AUTH-021, 002);
 * templates/delivery are owned by NOTIF. Implementations throw on delivery failure
 * so the caller can surface a 503 (AC2).
 */
export interface INotificationDispatcher {
  dispatchOtp(command: DispatchOtpCommand): Promise<void>;
  /** Sends the `auth.email_verify` email (FR-AUTH-002, 043). */
  dispatchEmailVerification(command: DispatchEmailVerificationCommand): Promise<void>;
  /** Sends the `auth.password_reset` email (FR-AUTH-033). */
  dispatchPasswordReset(command: DispatchPasswordResetCommand): Promise<void>;
}

export const NOTIFICATION_DISPATCHER = Symbol('INotificationDispatcher');
