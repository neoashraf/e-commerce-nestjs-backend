import { MfaChannel } from '../enums/mfa-channel.enum';
import { MfaEnforcement } from '../enums/mfa-enforcement.enum';

/**
 * Global, admin-configurable 2FA policy (single row) — SRS §8, FR-MFA-030/031.
 * Email is enabled by default; SMS is off until an admin enables it (BR-MFA-10).
 */
export class MfaSettings {
  constructor(
    public readonly id: string,
    public smsEnabled: boolean,
    public emailEnabled: boolean,
    public enforcementMode: MfaEnforcement,
    public otpTtlSeconds: number,
    public resendCooldownSeconds: number,
    public maxAttempts: number,
    public updatedBy: string | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
    /**
     * First-attempt delivery channel for customers with BOTH channels eligible and no
     * saved preference (FR-MFA-036, default email). Must reference an enabled channel.
     */
    public defaultChannel: MfaChannel = MfaChannel.EMAIL,
  ) {}

  /** Channels the platform currently offers, in preference order (email first). */
  availableChannels(): MfaChannel[] {
    const channels: MfaChannel[] = [];
    if (this.emailEnabled) channels.push(MfaChannel.EMAIL);
    if (this.smsEnabled) channels.push(MfaChannel.SMS);
    return channels;
  }

  isChannelEnabled(channel: MfaChannel): boolean {
    return channel === MfaChannel.SMS ? this.smsEnabled : this.emailEnabled;
  }

  get isMandatory(): boolean {
    return this.enforcementMode === MfaEnforcement.MANDATORY;
  }

  /**
   * Apply an admin policy change (FR-MFA-030). Rejects a mandatory policy with no channel
   * (FR-MFA-031, BR-MFA-8) — that would lock every customer out.
   */
  update(
    patch: {
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      enforcementMode?: MfaEnforcement;
      defaultChannel?: MfaChannel;
      otpTtlSeconds?: number;
      resendCooldownSeconds?: number;
      maxAttempts?: number;
    },
    updatedBy: string | null,
    now: Date,
  ): void {
    const smsEnabled = patch.smsEnabled ?? this.smsEnabled;
    const emailEnabled = patch.emailEnabled ?? this.emailEnabled;
    const enforcementMode = patch.enforcementMode ?? this.enforcementMode;
    const defaultChannel = patch.defaultChannel ?? this.defaultChannel;

    if (enforcementMode === MfaEnforcement.MANDATORY && !smsEnabled && !emailEnabled) {
      throw new Error('MFA_NO_CHANNEL');
    }
    // FR-MFA-036: the default channel must reference a channel enabled in the same policy.
    const defaultEnabled = defaultChannel === MfaChannel.SMS ? smsEnabled : emailEnabled;
    if (!defaultEnabled) {
      throw new Error('MFA_DEFAULT_CHANNEL_DISABLED');
    }

    this.smsEnabled = smsEnabled;
    this.emailEnabled = emailEnabled;
    this.enforcementMode = enforcementMode;
    this.defaultChannel = defaultChannel;
    if (patch.otpTtlSeconds !== undefined) this.otpTtlSeconds = patch.otpTtlSeconds;
    if (patch.resendCooldownSeconds !== undefined)
      this.resendCooldownSeconds = patch.resendCooldownSeconds;
    if (patch.maxAttempts !== undefined) this.maxAttempts = patch.maxAttempts;
    this.updatedBy = updatedBy;
    this.updatedAt = now;
  }
}
