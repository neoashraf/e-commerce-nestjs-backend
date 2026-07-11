import { MfaChannel } from '../enums/mfa-channel.enum';

/**
 * Per-customer 2FA state (SRS §8 — the `Customer` MFA extension, realized as a 1:1 companion
 * record keyed by `customerId` so the shared AUTH `Customer` entity stays untouched).
 */
export class CustomerMfa {
  constructor(
    public readonly customerId: string,
    public enabled: boolean,
    public preferredChannel: MfaChannel | null,
    public enabledAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /** A customer with no row yet is treated as "2FA off, no preference". */
  static none(customerId: string, now: Date): CustomerMfa {
    return new CustomerMfa(customerId, false, null, null, now, now);
  }

  enable(preferredChannel: MfaChannel, now: Date): void {
    this.enabled = true;
    this.preferredChannel = preferredChannel;
    this.enabledAt = now;
    this.updatedAt = now;
  }

  disable(now: Date): void {
    this.enabled = false;
    this.updatedAt = now;
  }

  setPreferredChannel(channel: MfaChannel, now: Date): void {
    this.preferredChannel = channel;
    this.updatedAt = now;
  }
}
