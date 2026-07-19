import { TwofaChallenge } from '../entities/twofa-challenge.entity';
import { TwofaPurpose } from '../enums/twofa-purpose.enum';

export interface ITwofaChallengeRepository {
  findById(id: string): Promise<TwofaChallenge | null>;
  save(challenge: TwofaChallenge): Promise<TwofaChallenge>;
  /** Most recent challenge for an admin (resend cooldown, FR-MFA-008-equivalent). */
  findLatestByAdmin(adminUserId: string): Promise<TwofaChallenge | null>;
  /** Most recent challenge for an admin with a given purpose (disable-code lookup, FR-RBAC-009). */
  findLatestByAdminAndPurpose(
    adminUserId: string,
    purpose: TwofaPurpose,
  ): Promise<TwofaChallenge | null>;
  /** Count challenges created for an admin at/after `since` (hourly cap). */
  countCreatedSince(adminUserId: string, since: Date): Promise<number>;
}

export const TWOFA_CHALLENGE_REPOSITORY = Symbol('ITwofaChallengeRepository');
