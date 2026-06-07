import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless, signed unsubscribe tokens (FR-NOTIF-054, §12.13). A promotional email embeds a token
 * that identifies the recipient with no server-side state and no login: `base64url(payload).hmac`.
 * The HMAC (keyed by `NOTIF_UNSUBSCRIBE_SECRET`) makes tokens unforgeable, so clicking the link can
 * apply the opt-out for exactly that recipient. Kept here so the dispatch path (mint) and the
 * unsubscribe controller (verify) share one grammar.
 */

export interface UnsubscribePayload {
  /** Recipient email being opted out (lower-cased). */
  email: string;
  /** Customer id when known, so the real AUTH seam can resolve the preference row. */
  customerId?: string;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadPart: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadPart).digest('base64url');
}

/** Mint a signed unsubscribe token for the recipient. */
export function mintUnsubscribeToken(payload: UnsubscribePayload, secret: string): string {
  const body = b64url(JSON.stringify({ email: payload.email.toLowerCase(), customerId: payload.customerId }));
  return `${body}.${sign(body, secret)}`;
}

/** Verify + decode a token; returns the payload or `null` when malformed or the signature is invalid. */
export function verifyUnsubscribeToken(token: string, secret: string): UnsubscribePayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as UnsubscribePayload;
    if (!parsed?.email || typeof parsed.email !== 'string') return null;
    return { email: parsed.email.toLowerCase(), customerId: parsed.customerId };
  } catch {
    return null;
  }
}
