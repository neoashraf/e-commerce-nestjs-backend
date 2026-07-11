import { createHash, randomBytes } from 'crypto';

/** Generate an opaque pre-auth token (raw handed to the client, hash persisted). */
export function mintPreAuthToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: hashPreAuthToken(raw) };
}

/** SHA-256 of a raw pre-auth token — the value stored/looked up (raw is never persisted). */
export function hashPreAuthToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
