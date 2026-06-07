/** Password hashing/verification (bcrypt) — SRS §14 security. */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  compare(plain: string, hash: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('IPasswordHasher');
