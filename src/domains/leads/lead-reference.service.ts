import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Generates the human-readable lead reference `HLP-<n>` (SRS §4 "Lead Reference"; FR-LEAD-002). Uniqueness
 * comes from a dedicated Postgres sequence (`lead_reference_seq`, created in the migration), so concurrent
 * submissions never collide.
 */
@Injectable()
export class LeadReferenceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async next(): Promise<string> {
    const rows = (await this.dataSource.query(
      `SELECT nextval('lead_reference_seq') AS seq`,
    )) as Array<{ seq: string }>;
    return `HLP-${rows[0].seq}`;
  }
}
