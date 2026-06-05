/**
 * Shared attribute invariants (SRS 02 §11 Validation Rules, BR-CAT-11).
 * Kept in the domain layer so use cases and seeds enforce identical rules.
 */

/** `code`: 2–60 chars, lower snake_case `[a-z0-9_]`, immutable after creation (FR-CAT-050). */
export const ATTRIBUTE_CODE_PATTERN = /^[a-z0-9_]{2,60}$/;

export function isValidAttributeCode(code: string): boolean {
  return ATTRIBUTE_CODE_PATTERN.test(code);
}
