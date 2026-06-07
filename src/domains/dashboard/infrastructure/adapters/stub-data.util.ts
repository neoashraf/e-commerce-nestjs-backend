import { DateRange } from '../../domain/dashboard-period';

/**
 * Deterministic helpers for the dashboard **stub** adapters (no randomness — repeatable output).
 * These produce representative figures so the composed summary, deltas, and charts render
 * end-to-end before the real read ports are wired (see each adapter's TODO-INTEGRATION marker).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Inclusive list of `YYYY-MM-DD` days across the range (capped for safety). */
export function eachDay(range: DateRange, cap = 366): string[] {
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  const days: string[] = [];
  for (let t = start; t <= end && days.length < cap; t += MS_PER_DAY) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/** Inclusive day count of a range (≥ 1). */
export function dayCount(range: DateRange): number {
  return Math.max(1, eachDay(range).length);
}

/** A small, stable per-day seed (0–6) derived from the date — lets stubs vary without randomness. */
export function daySeed(day: string): number {
  let sum = 0;
  for (const ch of day) sum += ch.charCodeAt(0);
  return sum % 7;
}

/** Representative daily revenue (BDT) for a given day — stable, mildly day-dependent. */
export function dailyRevenue(day: string): number {
  return 90_000 + daySeed(day) * 7_500;
}

/** Representative daily order count for a given day. */
export function dailyOrders(day: string): number {
  return 12 + daySeed(day);
}
