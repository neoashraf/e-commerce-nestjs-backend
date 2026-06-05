export interface SignedAccessToken {
  token: string;
  /** Access-token lifetime in seconds (for the API `expires_in`). */
  expiresIn: number;
}

export interface MintedRefreshToken {
  /** Opaque token handed to the client. */
  raw: string;
  /** Hash persisted in the Session row (raw is never stored). */
  hash: string;
  expiresAt: Date;
}

export interface ITokenService {
  signAccessToken(customerId: string): Promise<SignedAccessToken>;
  mintRefreshToken(now: Date): MintedRefreshToken;
  hashRefreshToken(raw: string): string;
}

export const TOKEN_SERVICE = Symbol('ITokenService');
