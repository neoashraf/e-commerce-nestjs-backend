/**
 * Time-series bucket granularity (SRS 15 §4 Period / §11). `day`/`week`/`month`; week = ISO week
 * (Monday-start), month = calendar month, all in the platform timezone (Asia/Dhaka, BR-RPT-4).
 */
export enum ReportBucket {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/** Breakdown dimension for the sales report (SRS 15 §5.2 FR-RPT-011). */
export enum SalesBreakdown {
  NONE = 'none',
  CATEGORY = 'category',
  DELIVERY_ZONE = 'delivery_zone',
  PAYMENT_METHOD = 'payment_method',
}

/** Platform timezone — day/week/month boundaries are computed in this zone (BR-RPT-4, §15). */
export const REPORT_TIMEZONE = 'Asia/Dhaka';

/** Maximum allowed span for a single report query, in days (SRS 15 §11 validation: ≤ ~2 years). */
export const MAX_PERIOD_DAYS = 400;

/**
 * A validated reporting period: an inclusive date range `[from, to]` (calendar days, Asia/Dhaka) with a
 * bucket granularity. Construction enforces the validation rules in SRS 15 §11 (valid dates, `from ≤ to`,
 * span ≤ {@link MAX_PERIOD_DAYS}); an invalid range throws {@link InvalidReportPeriodError} which the
 * presentation layer maps to `400` (contract: oversized/bad range → `400`).
 */
export class InvalidReportPeriodError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'InvalidReportPeriodError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class ReportPeriod {
  private constructor(
    /** Inclusive start date `YYYY-MM-DD` (Asia/Dhaka calendar day). */
    public readonly from: string,
    /** Inclusive end date `YYYY-MM-DD` (Asia/Dhaka calendar day). */
    public readonly to: string,
    public readonly bucket: ReportBucket,
  ) {}

  /**
   * Parse + validate raw query params into a period. `bucket` is auto-coarsened for long ranges
   * (§11: "auto-coarsened for very long ranges") so a day bucket over many months stays performant.
   */
  static create(from: string, to: string, bucket: ReportBucket = ReportBucket.DAY): ReportPeriod {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new InvalidReportPeriodError('Dates must be ISO calendar days (YYYY-MM-DD).');
    }
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new InvalidReportPeriodError('Invalid calendar date.');
    }
    if (fromMs > toMs) {
      throw new InvalidReportPeriodError('`from` must be on or before `to`.');
    }
    const spanDays = Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
    if (spanDays > MAX_PERIOD_DAYS) {
      throw new InvalidReportPeriodError(
        `Period span ${spanDays}d exceeds the ${MAX_PERIOD_DAYS}d maximum.`,
      );
    }
    return new ReportPeriod(from, to, ReportPeriod.coarsenBucket(bucket, spanDays));
  }

  /** Auto-coarsen the bucket so a long range never renders thousands of day buckets (§11/§12.1). */
  private static coarsenBucket(bucket: ReportBucket, spanDays: number): ReportBucket {
    if (bucket === ReportBucket.DAY && spanDays > 92) return ReportBucket.WEEK;
    return bucket;
  }
}
