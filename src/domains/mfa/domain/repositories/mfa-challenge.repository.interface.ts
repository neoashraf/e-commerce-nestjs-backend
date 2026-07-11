import { MfaChallenge } from '../entities/mfa-challenge.entity';

export interface IMfaChallengeRepository {
  findById(id: string): Promise<MfaChallenge | null>;
  save(challenge: MfaChallenge): Promise<MfaChallenge>;
  /** Most recent challenge for a customer (resend cooldown check). */
  findLatestByCustomer(customerId: string): Promise<MfaChallenge | null>;
  /** Count challenges created for a customer at/after `since` (hourly cap). */
  countCreatedSince(customerId: string, since: Date): Promise<number>;
  /** Consume all outstanding (non-consumed) challenges for a customer (invalidate prior codes). */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
}

export const MFA_CHALLENGE_REPOSITORY = Symbol('IMfaChallengeRepository');
