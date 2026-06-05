/** Password hashing/verification (bcrypt/argon2) — FR-AUTH-031, SRS 01 §14 security. */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('IPasswordHasher');
