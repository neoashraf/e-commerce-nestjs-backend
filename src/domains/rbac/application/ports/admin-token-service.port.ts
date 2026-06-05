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
export interface IAdminTokenService {
  signAccessToken(adminId: string, roleId: string): Promise<SignedAdminAccessToken>;
  mintRefreshToken(now: Date, remember: boolean): MintedAdminRefreshToken;
  hashRefreshToken(raw: string): string;
}

export const ADMIN_TOKEN_SERVICE = Symbol('IAdminTokenService');
