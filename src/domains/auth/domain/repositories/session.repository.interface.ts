import { Session } from '../entities/session.entity';

export interface ISessionRepository {
  findByRefreshTokenHash(hash: string): Promise<Session | null>;
  save(session: Session): Promise<Session>;
  /** Revoke every active session for a customer (FR-AUTH-015). Returns count revoked. */
  revokeAllForCustomer(customerId: string, now: Date): Promise<void>;
  /**
   * Revoke every active session for a customer EXCEPT the one identified by `exceptSessionId`
   * (BR-AUTH-5: password set/change, phone change, email change, 2FA enable/disable).
   * If `exceptSessionId` is null the behavior degrades to `revokeAllForCustomer`.
   */
  revokeAllForCustomerExcept(
    customerId: string,
    exceptSessionId: string | null,
    now: Date,
  ): Promise<void>;
}

export const SESSION_REPOSITORY = Symbol('ISessionRepository');
