import {
  InvalidReportPeriodError,
  ReportBucket,
  ReportPeriod,
} from '../../domain/report-period';

describe('RPT — ReportPeriod validation (§11)', () => {
  it('accepts a valid range and keeps the requested bucket', () => {
    const p = ReportPeriod.create('2026-05-01', '2026-05-31', ReportBucket.DAY);
    expect(p.from).toBe('2026-05-01');
    expect(p.to).toBe('2026-05-31');
    expect(p.bucket).toBe(ReportBucket.DAY);
  });

  it('rejects from > to (→ 400 INVALID_PERIOD)', () => {
    expect(() => ReportPeriod.create('2026-05-31', '2026-05-01')).toThrow(InvalidReportPeriodError);
  });

  it('rejects an oversized range beyond the max span', () => {
    expect(() => ReportPeriod.create('2020-01-01', '2026-01-01')).toThrow(InvalidReportPeriodError);
  });

  it('rejects malformed dates', () => {
    expect(() => ReportPeriod.create('2026-5-1', '2026-05-31')).toThrow(InvalidReportPeriodError);
  });

  it('auto-coarsens a day bucket to week for long ranges (§12.1)', () => {
    const p = ReportPeriod.create('2026-01-01', '2026-06-01', ReportBucket.DAY);
    expect(p.bucket).toBe(ReportBucket.WEEK);
  });
});
