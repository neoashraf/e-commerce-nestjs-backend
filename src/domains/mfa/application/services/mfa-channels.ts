import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { MfaChannel } from '../../domain/enums/mfa-channel.enum';

/** The contact facts MFA needs from an AUTH `Customer` to decide channel eligibility. */
export interface CustomerContacts {
  email: string | null;
  emailVerified: boolean;
  phone: string;
  phoneVerified: boolean;
}

/**
 * Channels this customer may actually use: enabled by policy AND verified on the account
 * (BR-MFA-6). Email is listed first (the default channel). FR-MFA-035.
 */
export function eligibleChannels(settings: MfaSettings, c: CustomerContacts): MfaChannel[] {
  const out: MfaChannel[] = [];
  if (settings.emailEnabled && c.email && c.emailVerified) out.push(MfaChannel.EMAIL);
  if (settings.smsEnabled && c.phone && c.phoneVerified) out.push(MfaChannel.SMS);
  return out;
}

/**
 * Resolve which channel a challenge goes to (FR-MFA-012/036): the customer's saved
 * preference (if still eligible) → the policy `default_channel` (if eligible) → the
 * single/first eligible channel. Callers guarantee `eligible` is non-empty.
 */
export function resolveChallengeChannel(
  settings: MfaSettings,
  preferred: MfaChannel | null,
  eligible: MfaChannel[],
): MfaChannel {
  if (preferred && eligible.includes(preferred)) return preferred;
  if (eligible.includes(settings.defaultChannel)) return settings.defaultChannel;
  return eligible[0];
}

/** The raw destination (email or E.164 phone) a code on `channel` is sent to. */
export function destinationFor(channel: MfaChannel, c: CustomerContacts): string | null {
  if (channel === MfaChannel.EMAIL) return c.email;
  return c.phone ? c.phone : null;
}

/** Mask a destination for display (never return the full address/number cross-origin). */
export function maskDestination(channel: MfaChannel, destination: string): string {
  return channel === MfaChannel.EMAIL ? maskEmail(destination) : maskPhone(destination);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '****';
  const head = local.slice(0, 1);
  const tail = local.length > 1 ? local.slice(-1) : '';
  return `${head}****${tail}@${domain}`;
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 4)}*****${phone.slice(-3)}`;
}
