export interface DispatchOtpCommand {
  phone: string;
  code: string;
  purpose: 'register' | 'login' | 'phone_change' | 'password_reset';
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

export interface DispatchMfaCodeCommand {
  channel: 'sms' | 'email';
  /** Present when channel = 'sms'. */
  phone?: string | null;
  /** Present when channel = 'email'. */
  email?: string | null;
  code: string;
}

export interface DispatchMfaStateChangeCommand {
  channel: 'sms' | 'email';
  phone?: string | null;
  email?: string | null;
  /** true = 2FA enabled, false = disabled. */
  enabled: boolean;
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
  /** Sends the `otp.login_2fa` second-factor code over SMS or email (FR-MFA-012, 021). */
  dispatchMfaCode(command: DispatchMfaCodeCommand): Promise<void>;
  /** Sends the `auth.mfa_changed` enable/disable confirmation (FR-MFA-006, 043). */
  dispatchMfaStateChange(command: DispatchMfaStateChangeCommand): Promise<void>;
}

export const NOTIFICATION_DISPATCHER = Symbol('INotificationDispatcher');
