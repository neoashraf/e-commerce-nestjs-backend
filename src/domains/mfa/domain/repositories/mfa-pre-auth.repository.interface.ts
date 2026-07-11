import { MfaPreAuth } from '../entities/mfa-pre-auth.entity';

export interface IMfaPreAuthRepository {
  findByTokenHash(tokenHash: string): Promise<MfaPreAuth | null>;
  save(preAuth: MfaPreAuth): Promise<MfaPreAuth>;
}

export const MFA_PRE_AUTH_REPOSITORY = Symbol('IMfaPreAuthRepository');
