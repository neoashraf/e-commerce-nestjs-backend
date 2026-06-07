import { ReportBucket } from '../../domain/report-period';
import { ReportRange } from './orders-read.port';

/** One time-series row of completed-refund value, keyed by the bucket's start day. */
export interface RefundsBucketRow {
  /** Bucket start as `YYYY-MM-DD` (Asia/Dhaka). */
  bucket: string;
  /** Σ completed refund amount in the bucket (BDT, 2dp string). */
  amount: string;
}

/**
 * Read-only view RPT takes over PAY (refunds). Refunds are attributed to the period they are processed
 * in (§12.3) — i.e. by the refund's own timestamp, independent of when the original sale occurred. Only
 * `completed` refunds count. Read-side only — no mutation (BR-RPT-5).
 */
export interface IPaymentsReadModel {
  /** Completed-refund value bucketed by day/week/month (Asia/Dhaka), attributed to the refund period. */
  getRefundsSeries(range: ReportRange, bucket: ReportBucket): Promise<RefundsBucketRow[]>;

  /** Total completed-refund value in the period (Σ refund.amount). */
  getRefundsTotal(range: ReportRange): Promise<string>;
}

export const PAYMENTS_READ_MODEL = Symbol('IPaymentsReadModel');
