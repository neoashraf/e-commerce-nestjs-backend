import { Customer } from '../entities/customer.entity';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findActiveByPhone(phone: string): Promise<Customer | null>;
  /** Active account owning this email (case-insensitive), for register/login (FR-AUTH-004, 011). */
  findActiveByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<Customer>;
  /**
   * Release job (FR-AUTH-045): clear the email of accounts that registered with
   * email+password before `cutoff` but never verified it and never logged in again
   * (registration stamps `last_login_at = created_at`, so "no successful login since"
   * is `last_login_at <= created_at`). Idempotent. Returns the number released.
   */
  releaseUnverifiedEmails(cutoff: Date, now: Date): Promise<number>;
}

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');
