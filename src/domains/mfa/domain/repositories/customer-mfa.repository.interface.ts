import { CustomerMfa } from '../entities/customer-mfa.entity';

export interface ICustomerMfaRepository {
  findByCustomerId(customerId: string): Promise<CustomerMfa | null>;
  save(state: CustomerMfa): Promise<CustomerMfa>;
}

export const CUSTOMER_MFA_REPOSITORY = Symbol('ICustomerMfaRepository');
