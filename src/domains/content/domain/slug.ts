/** Slug format: lowercase letters, digits, hyphens; no leading/trailing/double hyphen (SRS 13 §11). */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug);
}
