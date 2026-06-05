import { Session } from '../entities/session.entity';

export interface ISessionRepository {
  findByRefreshTokenHash(hash: string): Promise<Session | null>;
  save(session: Session): Promise<Session>;
  /** Revoke every active session for a customer (FR-AUTH-015). Returns count revoked. */
  revokeAllForCustomer(customerId: string, now: Date): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('ISessionRepository');
