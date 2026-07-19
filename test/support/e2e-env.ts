/**
 * Shared e2e environment preamble (auth-hardening-test). MUST be imported before
 * AppModule so ConfigService reads these instead of .env (process.env wins over
 * the env file):
 * - dedicated `e_commerce_test` database (migrations run against it beforehand);
 * - cooldowns zeroed so flows don't sleep between requests (the server-side 429
 *   logic itself is unit-tested);
 * - NODE_ENV=test disables the self-managed interval sweeps.
 */
export function applyE2eEnv(overrides: Record<string, string> = {}): void {
  process.env.NODE_ENV = 'test';
  process.env.DB_NAME = 'e_commerce_test';
  process.env.OTP_RESEND_COOLDOWN = '0';
  process.env.OTP_HOURLY_CAP = '1000';
  process.env.EMAIL_CHANGE_RESEND_COOLDOWN = '0';
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

/** Wipe the AUTH tables between suites (fresh DB — no cross-domain FKs to worry about). */
export const AUTH_TABLES = [
  'password_set_tokens',
  'email_change_requests',
  'password_reset_tokens',
  'email_verification_tokens',
  'otp_challenges',
  'sessions',
  'addresses',
  'customers',
];

/**
 * Notification recorder standing in for the NOTIF dispatcher port: captures the
 * codes AUTH sends (phone OTPs, email-change codes) so e2e flows can complete
 * them, plus the password-changed events for assertions. Never fails a dispatch.
 */
export class RecordingDispatcher {
  otpByPhone = new Map<string, string>();
  emailChangeByEmail = new Map<string, string>();
  passwordEvents: string[] = [];
  emailChangedNotices: string[] = [];

  async dispatchOtp(cmd: { phone: string; code: string }): Promise<void> {
    this.otpByPhone.set(cmd.phone, cmd.code);
  }
  async dispatchEmailVerification(): Promise<void> {}
  async dispatchPasswordReset(): Promise<void> {}
  async dispatchMfaCode(): Promise<void> {}
  async dispatchMfaStateChange(): Promise<void> {}
  async dispatchPasswordChanged(cmd: { event: string }): Promise<void> {
    this.passwordEvents.push(cmd.event);
  }
  async dispatchEmailChangeCode(cmd: { email: string; code: string }): Promise<void> {
    this.emailChangeByEmail.set(cmd.email, cmd.code);
  }
  async dispatchEmailChangedNotice(cmd: { email: string }): Promise<void> {
    this.emailChangedNotices.push(cmd.email);
  }
}
