import { TwofaChallenge } from '../entities/twofa-challenge.entity';

export interface ITwofaChallengeRepository {
  findById(id: string): Promise<TwofaChallenge | null>;
  save(challenge: TwofaChallenge): Promise<TwofaChallenge>;
}

export const TWOFA_CHALLENGE_REPOSITORY = Symbol('ITwofaChallengeRepository');
