import { MfaChannel } from '../domain/enums/mfa-channel.enum';

/** A challenge as surfaced to the client (masked destination, never the raw code). */
export interface MfaChallengeView {
  id: string;
  channel: MfaChannel;
  sentTo: string;
  expiresIn: number;
  resendAfter: number;
}

/** Result of the login gate when a second factor is required (FR-MFA-010). */
export interface MfaLoginStarted {
  preAuthToken: string;
  challenge: MfaChallengeView;
  availableChannels: MfaChannel[];
}
