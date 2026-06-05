import { OtpChallenge } from '../entities/otp-challenge.entity';

export interface IOtpChallengeRepository {
  findById(id: string): Promise<OtpChallenge | null>;
  save(challenge: OtpChallenge): Promise<OtpChallenge>;
  /** Most recently created challenge for a phone (for resend cooldown). */
  findLatestByPhone(phone: string): Promise<OtpChallenge | null>;
  /** Count challenges created for a phone at/after `since` (for the hourly cap). */
  countCreatedSince(phone: string, since: Date): Promise<number>;
  /** Consume all outstanding (non-consumed) challenges for a phone (FR-AUTH-024). */
  consumeOutstandingForPhone(phone: string, now: Date): Promise<void>;
}

export const OTP_CHALLENGE_REPOSITORY = Symbol('IOtpChallengeRepository');
