export interface MintedVerificationToken {
  /** Opaque token embedded in the email link; never persisted. */
  raw: string;
  /** Hash stored in the EmailVerificationToken row. */
  hash: string;
}

/** Mints/hashes opaque single-use tokens for email verification (FR-AUTH-043). */
export interface IVerificationTokenService {
  mint(): MintedVerificationToken;
  hash(raw: string): string;
}

export const VERIFICATION_TOKEN_SERVICE = Symbol('IVerificationTokenService');
