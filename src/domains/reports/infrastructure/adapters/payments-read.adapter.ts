import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ReportBucket, REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import { IPaymentsReadModel, RefundsBucketRow } from '../../application/ports/payments-read.port';

/**
 * Read-only PAY adapter for RPT. Aggregates completed refunds from the `refunds` table, attributed to
 * the period each refund was processed in (§12.3) — independent of when the sale occurred. Buckets and
 * the range filter are evaluated in Asia/Dhaka (BR-RPT-4). Read-side only (BR-RPT-5); decoupled from
 * PAY's ORM classes (table/column names only).
 */
@Injectable()
export class PaymentsReadAdapter implements IPaymentsReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getRefundsSeries(range: ReportRange, bucket: ReportBucket): Promise<RefundsBucketRow[]> {
    const rows: Array<{ bucket: string; amount: string }> = await this.dataSource.query(
      `SELECT to_char(date_trunc($3, (r.created_at AT TIME ZONE '${REPORT_TIMEZONE}')), 'YYYY-MM-DD') AS bucket,
              COALESCE(SUM(r.amount), 0)::text AS amount
       FROM refunds r
       WHERE r.status = 'completed'
         AND (r.created_at AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date
       GROUP BY 1 ORDER BY 1`,
      [range.from, range.to, bucket],
    );
    return rows.map((r) => ({ bucket: r.bucket, amount: r.amount }));
  }

  async getRefundsTotal(range: ReportRange): Promise<string> {
    const [row]: Array<{ total: string }> = await this.dataSource.query(
      `SELECT COALESCE(SUM(r.amount), 0)::text AS total
       FROM refunds r
       WHERE r.status = 'completed'
         AND (r.created_at AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to],
    );
    return row?.total ?? '0.00';
  }
}
