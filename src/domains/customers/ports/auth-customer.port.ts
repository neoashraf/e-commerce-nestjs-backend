import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { CustomerStatus } from '../customers.enums';

/** Identity/preferences read from AUTH for the 360 profile (FR-CUST-010, BR-CUST-1). */
export interface CustomerIdentity {
  customerId: string;
  fullName: string;
  phone: string;
  phoneVerified: boolean;
  email: string | null;
  emailVerified: boolean;
  gender: string | null;
  dateOfBirth: string | null;
  status: string;
  isLightweight: boolean;
  promoSmsOptIn: boolean;
  promoEmailOptIn: boolean;
  createdAt: string;
}

/** A saved address read from AUTH (FR-CUST-011). */
export interface CustomerAddress {
  id: string;
  addressLine: string;
  area: string;
  district: string;
  division: string;
  postalCode: string | null;
  isDefault: boolean;
}

/**
 * Read/act port over AUTH-owned customer identity (BR-CUST-1). CUST never edits profile data; it only
 * reads identity/addresses and triggers the account-status change + session revoke that AUTH executes
 * (FR-CUST-020/021, BR-CUST-2). Decoupled from AUTH's ORM classes — table/column names only.
 */
export interface IAuthCustomerGateway {
  getIdentity(customerId: string): Promise<CustomerIdentity | null>;
  getAddresses(customerId: string): Promise<CustomerAddress[]>;
  setStatus(customerId: string, status: CustomerStatus): Promise<void>;
  /** Revoke all live sessions for the customer; returns the number revoked. */
  revokeSessions(customerId: string): Promise<number>;
}

export const AUTH_CUSTOMER_GATEWAY = Symbol('IAuthCustomerGateway');

/** Real adapter — reads/updates the AUTH `customers` / `addresses` / `sessions` tables via DataSource. */
@Injectable()
export class AuthCustomerAdapter implements IAuthCustomerGateway {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getIdentity(customerId: string): Promise<CustomerIdentity | null> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT id, full_name, phone, phone_verified, email, email_verified, gender,
              to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth, status, is_lightweight,
              promo_sms_opt_in, promo_email_opt_in, created_at
       FROM customers WHERE id = $1`,
      [customerId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      customerId: r.id as string,
      fullName: r.full_name as string,
      phone: r.phone as string,
      phoneVerified: r.phone_verified as boolean,
      email: (r.email as string | null) ?? null,
      emailVerified: r.email_verified as boolean,
      gender: (r.gender as string | null) ?? null,
      dateOfBirth: (r.date_of_birth as string | null) ?? null,
      status: r.status as string,
      isLightweight: r.is_lightweight as boolean,
      promoSmsOptIn: r.promo_sms_opt_in as boolean,
      promoEmailOptIn: r.promo_email_opt_in as boolean,
      createdAt: (r.created_at as Date).toISOString(),
    };
  }

  async getAddresses(customerId: string): Promise<CustomerAddress[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT id, address_line, area, district, division, postal_code, is_default
       FROM addresses WHERE customer_id = $1 AND deleted_at IS NULL
       ORDER BY is_default DESC, created_at ASC`,
      [customerId],
    );
    return rows.map((r) => ({
      id: r.id as string,
      addressLine: r.address_line as string,
      area: r.area as string,
      district: r.district as string,
      division: r.division as string,
      postalCode: (r.postal_code as string | null) ?? null,
      isDefault: r.is_default as boolean,
    }));
  }

  async setStatus(customerId: string, status: CustomerStatus): Promise<void> {
    await this.dataSource.query(
      `UPDATE customers SET status = $2, updated_at = now() WHERE id = $1`,
      [customerId, status],
    );
  }

  async revokeSessions(customerId: string): Promise<number> {
    const result: Array<Record<string, unknown>> = await this.dataSource.query(
      `UPDATE sessions SET revoked_at = now()
       WHERE customer_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [customerId],
    );
    return result.length;
  }
}
