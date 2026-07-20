import { MfaChallenge } from '../entities/mfa-challenge.entity';
import { MfaChallengePurpose } from '../enums/mfa-challenge-purpose.enum';

export interface IMfaChallengeRepository {
  findById(id: string): Promise<MfaChallenge | null>;
  /** Most recent challenge for a customer with a given purpose (disable code lookup, FR-MFA-002). */
  findLatestByCustomerAndPurpose(
    customerId: string,
    purpose: MfaChallengePurpose,
  ): Promise<MfaChallenge | null>;
  save(challenge: MfaChallenge): Promise<MfaChallenge>;
  /** Most recent challenge for a customer (resend cooldown check). */
  findLatestByCustomer(customerId: string): Promise<MfaChallenge | null>;
  /** Count challenges created for a customer at/after `since` (hourly cap). */
  countCreatedSince(customerId: string, since: Date): Promise<number>;
  /** Consume all outstanding (non-consumed) challenges for a customer (invalidate prior codes). */
  consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void>;
}

export const MFA_CHALLENGE_REPOSITORY = Symbol('IMfaChallengeRepository');
