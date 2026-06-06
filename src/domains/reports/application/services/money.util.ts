/**
 * Money helpers for the reporting layer. Aggregates arrive as Decimal(12,2) strings from SQL; we work
 * in integer paisa (cents) to keep sums/subtractions exact (no float drift) and always render back to a
 * fixed 2dp string so rounding is consistent across totals, series, breakdowns, and DASH (§14, §12.12).
 */

/** Parse a decimal money string (or null/number) to integer paisa. */
export function toPaisa(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Render integer paisa back to a 2dp BDT string. */
export function fromPaisa(paisa: number): string {
  return (paisa / 100).toFixed(2);
}

/** Sum a list of decimal money strings, returning a 2dp string. */
export function sumMoney(values: Array<string | number | null | undefined>): string {
  return fromPaisa(values.reduce<number>((acc, v) => acc + toPaisa(v), 0));
}

/** `a − b` for two decimal money strings, returning a 2dp string (may be negative). */
export function subtractMoney(a: string | number | null, b: string | number | null): string {
  return fromPaisa(toPaisa(a) - toPaisa(b));
}

/** `numerator / divisor` as a 2dp string; 0.00 when divisor is 0 (FR-RPT: AOV with no paid orders). */
export function divideMoney(numerator: string | number | null, divisor: number): string {
  if (!divisor) return '0.00';
  return (toPaisa(numerator) / 100 / divisor).toFixed(2);
}

/** Round a ratio to 3 decimal places (cancellation/return rates — contract shows e.g. 0.072). */
export function ratio(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 1000;
}
