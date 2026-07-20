export interface SignedAdminAccessToken {
  token: string;
  expiresIn: number;
}

export interface MintedAdminRefreshToken {
  raw: string;
  hash: string;
  expiresAt: Date;
}

/**
 * Issues admin access tokens (JWT, `aud: 'admin'` — distinct from customer, BR-RBAC-7)
 * and opaque refresh tokens (hashed for storage/rotation).
 */
export interface SignAdminAccessTokenOptions {
  /** JWT `sid` — the refresh session this token binds to (spared by revoke sweeps). */
  sessionId?: string;
  /** JWT `mfa` — the login passed the 2FA step (FR-RBAC-009 disable gating). */
  mfaVerified?: boolean;
}

export interface IAdminTokenService {
  signAccessToken(
    adminId: string,
    roleId: string,
    options?: SignAdminAccessTokenOptions,
  ): Promise<SignedAdminAccessToken>;
  mintRefreshToken(now: Date, remember: boolean): MintedAdminRefreshToken;
  hashRefreshToken(raw: string): string;
}

export const ADMIN_TOKEN_SERVICE = Symbol('IAdminTokenService');
