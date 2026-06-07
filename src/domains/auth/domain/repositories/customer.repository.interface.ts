import { Customer } from '../entities/customer.entity';

export interface ICustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findActiveByPhone(phone: string): Promise<Customer | null>;
  /** Active account owning this email (case-insensitive), for register/login (FR-AUTH-004, 011). */
  findActiveByEmail(email: string): Promise<Customer | null>;
  save(customer: Customer): Promise<Customer>;
}

export const CUSTOMER_REPOSITORY = Symbol('ICustomerRepository');
