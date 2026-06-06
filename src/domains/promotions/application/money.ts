/**
 * Deterministic Decimal(12,2) money math for the coupon engine (SRS 14 §14). All amounts are
 * BDT strings with two fraction digits. To avoid binary-float drift we compute in integer
 * paisa (1 BDT = 100 paisa) and format back to a `"0.00"` string. Half-up rounding.
 */

/** Parse a money string/number to integer paisa. Invalid/empty → 0. */
export function toPaisa(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') return 0;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Format integer paisa back to a `"0.00"` BDT string. */
export function fromPaisa(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paisa));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

/** Percentage of an amount, in paisa, half-up rounded. `percent` is e.g. 10 for 10%. */
export function percentOfPaisa(basePaisa: number, percent: number): number {
  return Math.round((basePaisa * percent) / 100);
}

/** Clamp a paisa value into [0, max]. */
export function clampPaisa(value: number, max: number): number {
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}
