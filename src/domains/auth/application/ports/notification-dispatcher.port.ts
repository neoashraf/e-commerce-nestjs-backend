export interface DispatchOtpCommand {
  phone: string;
  code: string;
  purpose: 'register' | 'login' | 'phone_change' | 'password_reset' | 'password_set';
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

export interface DispatchPasswordChangedCommand {
  /** Recipient email (present when the account has a verified email). */
  email?: string | null;
  /** Recipient phone (fallback when only a verified phone is available). */
  phone?: string | null;
  fullName: string;
  /** Kind of credential change — used to pick the notification template variant. */
  event: 'password_changed' | 'password_set' | 'password_reset';
}

export interface DispatchEmailChangeCodeCommand {
  /** The NEW (pending) address the code goes to (FR-AUTH-041). */
  email: string;
  fullName: string;
  code: string;
  ttlMinutes: number;
}

export interface DispatchEmailChangedNoticeCommand {
  /** The PREVIOUS address being notified (FR-AUTH-046). */
  email: string;
  fullName: string;
  /** Masked form of the new address (never leak the full new address to the old inbox). */
  newEmailMasked: string;
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
  /**
   * Sends a `auth.password_changed` (set / change / reset) confirmation to the account's
   * verified channels (FR-AUTH-038, BR-AUTH-5). Best-effort — must not fail the caller.
   */
  dispatchPasswordChanged(command: DispatchPasswordChangedCommand): Promise<void>;
  /** Sends the `auth.email_change_verify` code to the pending NEW address (FR-AUTH-041). */
  dispatchEmailChangeCode(command: DispatchEmailChangeCodeCommand): Promise<void>;
  /**
   * Notifies the PREVIOUS address that the account email changed (FR-AUTH-046).
   * Best-effort — must not fail the caller.
   */
  dispatchEmailChangedNotice(command: DispatchEmailChangedNoticeCommand): Promise<void>;
}

export const NOTIFICATION_DISPATCHER = Symbol('INotificationDispatcher');
