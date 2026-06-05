import { Address } from '../entities/address.entity';

export interface IAddressRepository {
  /** Active (non-deleted) address by id, or null. */
  findById(id: string): Promise<Address | null>;
  /** Active addresses for a customer, ordered default-first then most-recently-used. */
  findByCustomerId(customerId: string): Promise<Address[]>;
  save(address: Address): Promise<Address>;
  /** Clear the default flag on every active address of a customer (default-uniqueness, BR-AUTH-6). */
  clearDefault(customerId: string): Promise<void>;
  softDelete(id: string): Promise<void>;
}

export const ADDRESS_REPOSITORY = Symbol('IAddressRepository');
