/**
 * Wishlist size cap (FR-WISH-005, BR-WISH-4). Default 100 (SRS §16 unconfirmed) — kept a config constant
 * so the value can change without a migration; surfaced to clients as `meta.max_items`.
 */
export const MAX_WISHLIST_ITEMS = 100;

/** Max product ids accepted by the membership lookup in one call (bounded input, §14 latency budget). */
export const MAX_MEMBERSHIP_IDS = 200;

/** Max entries accepted in one guest-merge payload (bounded input). */
export const MAX_MERGE_ITEMS = 200;
