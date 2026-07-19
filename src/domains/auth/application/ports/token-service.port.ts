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

export interface SignAccessTokenOptions {
  /** Stamp the `mfa` claim: this session was created through a completed second factor (FR-MFA-018). */
  mfaVerified?: boolean;
}

export interface ITokenService {
  /**
   * Sign an access token that binds to a specific refresh-session so `PATCH /me/password`
   * can revoke every OTHER session (BR-AUTH-5). `sessionId` maps to the JWT `sid` claim.
   */
  signAccessToken(
    customerId: string,
    sessionId: string,
    options?: SignAccessTokenOptions,
  ): Promise<SignedAccessToken>;
  mintRefreshToken(now: Date): MintedRefreshToken;
  hashRefreshToken(raw: string): string;
}

export const TOKEN_SERVICE = Symbol('ITokenService');
