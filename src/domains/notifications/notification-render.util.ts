/**
 * Shared template render + SMS-encoding helpers (FR-NOTIF-014, 021).
 *
 * Single source of truth used by both the dispatch core (snapshot render at send time)
 * and the admin template manager (placeholder validation + preview). Keeping these here
 * avoids duplicating the `{{placeholder}}` grammar / segment maths across the module.
 */

/** Matches a `{{ placeholder }}` token; capture group 1 is the bare name. */
const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** ASCII-only ≈ GSM-7 for our templates; anything else (e.g. Bangla) is UCS-2/unicode. */
const GSM7 = /^[\x00-\x7F]*$/;

export type SmsEncoding = 'gsm7' | 'unicode';

export interface SmsEncodingResult {
  encoding: SmsEncoding;
  segments: number;
}

/** Render `{{placeholder}}` tokens from the variables map; unknown tokens are left intact. */
export function renderTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : `{{${key}}}`,
  );
}

/** The distinct placeholder names referenced by a template body/subject (order-preserving, deduped). */
export function extractPlaceholders(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER_RE)) {
    found.add(m[1]);
  }
  return [...found];
}

/** Compute the SMS encoding + segment count for a rendered body (FR-NOTIF-021). */
export function computeSmsEncoding(body: string): SmsEncodingResult {
  const encoding: SmsEncoding = GSM7.test(body) ? 'gsm7' : 'unicode';
  const perSegment = encoding === 'gsm7' ? 160 : 70;
  const segments = Math.max(1, Math.ceil(body.length / perSegment));
  return { encoding, segments };
}
