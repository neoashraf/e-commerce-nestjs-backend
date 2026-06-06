import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** A linked enquiry shown on the 360 profile (FR-CUST-013, deep-linkable by reference — FR-CUST-014). */
export interface LinkedLead {
  reference: string;
  type: string;
  status: string;
}

/** Read port over LEAD for a customer's linked enquiries. Read-only; decoupled from LEAD's ORM classes. */
export interface ILeadSource {
  getLeadsForCustomer(customerId: string, limit: number): Promise<LinkedLead[]>;
}

export const LEAD_SOURCE = Symbol('ILeadSource');

/** Real adapter — reads the LEAD `leads` table via DataSource. */
@Injectable()
export class LeadSourceAdapter implements ILeadSource {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getLeadsForCustomer(customerId: string, limit: number): Promise<LinkedLead[]> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT reference, type, status FROM leads
       WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [customerId, limit],
    );
    return rows.map((r) => ({
      reference: r.reference as string,
      type: r.type as string,
      status: r.status as string,
    }));
  }
}
