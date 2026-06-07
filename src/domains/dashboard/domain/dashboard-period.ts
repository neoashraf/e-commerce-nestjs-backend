/**
 * Dashboard period resolution (SRS 10 §5.1 FR-DASH-003, §11 validation, BR-DASH-5).
 *
 * A period is one of the presets (`today` / `last_7d` / `last_30d`) or a validated `custom`
 * range. Boundaries are computed as calendar days in the **platform timezone** (Asia/Dhaka,
 * UTC+6 fixed — §15). Every period also carries its **comparison range**: the immediately
 * preceding equal-length window (FR-DASH-002, BR-DASH-5).
 *
 * Construction enforces §11: valid ISO days, `from ≤ to`, `to` not in the future beyond today,
 * and span ≤ {@link MAX_PERIOD_DAYS}. A violation throws {@link InvalidDashboardPeriodError},
 * which the presentation layer maps to `400` (contract: invalid/oversized range → `400`).
 */

/** Allowed period presets (contract: `period` ∈ today | last_7d | last_30d | custom). */
export enum DashboardPeriodPreset {
  TODAY = 'today',
  LAST_7D = 'last_7d',
  LAST_30D = 'last_30d',
  CUSTOM = 'custom',
}

/** Platform timezone — day boundaries are computed in this zone (BR-DASH-5, §15). Dhaka = UTC+6, no DST. */
export const DASHBOARD_TIMEZONE = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Maximum allowed span for a single custom range, in days (§11: e.g. 1 year). */
export const MAX_PERIOD_DAYS = 366;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class InvalidDashboardPeriodError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = 'InvalidDashboardPeriodError';
  }
}

/** An inclusive calendar-day range `[from, to]` (Asia/Dhaka), both `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/** The current calendar day in Asia/Dhaka, as `YYYY-MM-DD`. */
export function todayInDhaka(now: Date = new Date()): string {
  return new Date(now.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function addDays(day: string, delta: number): string {
  return new Date(parseDay(day) + delta * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Inclusive day count of a range. */
function spanDays(range: DateRange): number {
  return Math.round((parseDay(range.to) - parseDay(range.from)) / MS_PER_DAY) + 1;
}

export class DashboardPeriod {
  private constructor(
    public readonly preset: DashboardPeriodPreset,
    /** Selected range (inclusive Asia/Dhaka calendar days). */
    public readonly range: DateRange,
    /** Immediately-preceding equal-length comparison range. */
    public readonly compare: DateRange,
  ) {}

  get from(): string {
    return this.range.from;
  }
  get to(): string {
    return this.range.to;
  }

  /**
   * Resolve raw query params into a validated period. `from`/`to` are only consulted for the
   * `custom` preset; presets derive their range from "today" in Asia/Dhaka.
   */
  static resolve(
    preset: DashboardPeriodPreset,
    from?: string,
    to?: string,
    now: Date = new Date(),
  ): DashboardPeriod {
    const today = todayInDhaka(now);
    let range: DateRange;

    switch (preset) {
      case DashboardPeriodPreset.TODAY:
        range = { from: today, to: today };
        break;
      case DashboardPeriodPreset.LAST_7D:
        range = { from: addDays(today, -6), to: today };
        break;
      case DashboardPeriodPreset.LAST_30D:
        range = { from: addDays(today, -29), to: today };
        break;
      case DashboardPeriodPreset.CUSTOM:
        range = DashboardPeriod.validateCustom(from, to, today);
        break;
      default:
        throw new InvalidDashboardPeriodError(`Unknown period preset "${String(preset)}".`);
    }

    const length = spanDays(range);
    const compareTo = addDays(range.from, -1);
    const compareFrom = addDays(compareTo, -(length - 1));
    return new DashboardPeriod(preset, range, { from: compareFrom, to: compareTo });
  }

  private static validateCustom(from: string | undefined, to: string | undefined, today: string): DateRange {
    if (!from || !to) {
      throw new InvalidDashboardPeriodError('A custom period requires both `from` and `to`.');
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new InvalidDashboardPeriodError('Dates must be ISO calendar days (YYYY-MM-DD).');
    }
    const fromMs = parseDay(from);
    const toMs = parseDay(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new InvalidDashboardPeriodError('Invalid calendar date.');
    }
    if (fromMs > toMs) {
      throw new InvalidDashboardPeriodError('`from` must be on or before `to`.');
    }
    if (toMs > parseDay(today)) {
      throw new InvalidDashboardPeriodError('`to` must not be in the future.');
    }
    const length = Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
    if (length > MAX_PERIOD_DAYS) {
      throw new InvalidDashboardPeriodError(
        `Period span ${length}d exceeds the ${MAX_PERIOD_DAYS}d maximum.`,
      );
    }
    return { from, to };
  }

  /** Stable cache signature for this period. */
  cacheKey(): string {
    return `${this.preset}:${this.range.from}:${this.range.to}`;
  }
}
