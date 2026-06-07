import { ReportBucket, ReportPeriod, SalesBreakdown } from '../../domain/report-period';
import {
  CustomerView,
  DEFAULT_TOP_N,
  InventoryView,
  MAX_TOP_N,
  MIN_TOP_N,
  ProductMetric,
  ProductView,
  SearchView,
} from '../../domain/report-views';

/** Raw export/schedule params (JSON from the request or the schedule template). */
export type RawReportParams = Record<string, unknown>;

/** A relative range token usable in a schedule's params template (resolved at run time). */
const RELATIVE_RANGES = new Set([
  'today',
  'yesterday',
  'last_7d',
  'last_30d',
  'last_90d',
  'this_month',
  'last_month',
]);

/** Thrown when params can't be turned into a valid report request; mapped to `400` by the controller. */
export class InvalidReportParamsError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'InvalidReportParamsError';
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Resolve a `{ from, to }` range from params. Supports an explicit `from`/`to` pair, or a relative
 * `range` token (`last_7d`, `this_month`, …) resolved against `now` — so scheduled digests carry a
 * rolling template (FR-RPT-071, §8 "params template e.g. last 7 days"). Defaults to the last 7 days.
 */
export function resolveRange(params: RawReportParams, now: Date): { from: string; to: string } {
  const from = asString(params.from);
  const to = asString(params.to);
  if (from && to) return { from, to };

  const token = asString(params.range) ?? 'last_7d';
  if (!RELATIVE_RANGES.has(token)) {
    throw new InvalidReportParamsError(
      `Unknown range token \`${token}\`; provide \`from\`/\`to\` or one of ${[...RELATIVE_RANGES].join(', ')}.`,
    );
  }
  const today = new Date(`${isoDay(now)}T00:00:00Z`);
  switch (token) {
    case 'today':
      return { from: isoDay(today), to: isoDay(today) };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: isoDay(y), to: isoDay(y) };
    }
    case 'last_7d':
      return { from: isoDay(addDays(today, -6)), to: isoDay(today) };
    case 'last_30d':
      return { from: isoDay(addDays(today, -29)), to: isoDay(today) };
    case 'last_90d':
      return { from: isoDay(addDays(today, -89)), to: isoDay(today) };
    case 'this_month': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { from: isoDay(first), to: isoDay(today) };
    }
    case 'last_month': {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
      return { from: isoDay(first), to: isoDay(last) };
    }
    default:
      return { from: isoDay(addDays(today, -6)), to: isoDay(today) };
  }
}

/** Build a validated {@link ReportPeriod} from params, mapping range errors to {@link InvalidReportParamsError}. */
export function resolvePeriod(params: RawReportParams, now: Date): ReportPeriod {
  const { from, to } = resolveRange(params, now);
  const bucket = enumOr(asString(params.bucket), ReportBucket, ReportBucket.DAY);
  try {
    return ReportPeriod.create(from, to, bucket);
  } catch (err) {
    throw new InvalidReportParamsError((err as Error).message);
  }
}

/** Coerce a raw value to a member of `enumObj`, falling back to `fallback` when absent/invalid. */
function enumOr<T extends Record<string, string>>(
  value: string | undefined,
  enumObj: T,
  fallback: T[keyof T],
): T[keyof T] {
  if (value && (Object.values(enumObj) as string[]).includes(value)) {
    return value as T[keyof T];
  }
  return fallback;
}

/** Clamp/parse a top-N from params (1–100; default 10) — §11 validation. */
export function resolveTopN(params: RawReportParams): number {
  const raw = params.top_n;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (Number.isNaN(n)) return DEFAULT_TOP_N;
  return Math.min(MAX_TOP_N, Math.max(MIN_TOP_N, Math.trunc(n)));
}

export const paramReaders = {
  salesBreakdown: (p: RawReportParams): SalesBreakdown =>
    enumOr(asString(p.breakdown), SalesBreakdown, SalesBreakdown.NONE),
  productView: (p: RawReportParams): ProductView =>
    enumOr(asString(p.view), ProductView, ProductView.TOP_SELLERS),
  productMetric: (p: RawReportParams): ProductMetric =>
    enumOr(asString(p.metric), ProductMetric, ProductMetric.UNITS),
  inventoryView: (p: RawReportParams): InventoryView =>
    enumOr(asString(p.view), InventoryView, InventoryView.LEVELS),
  customerView: (p: RawReportParams): CustomerView =>
    enumOr(asString(p.view), CustomerView, CustomerView.NEW_VS_RETURNING),
  searchView: (p: RawReportParams): SearchView =>
    enumOr(asString(p.view), SearchView, SearchView.POPULAR),
};
