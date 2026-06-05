/**
 * Customer password policy (FR-AUTH-030, SRS 01 §11): ≥8 chars, ≥1 letter, ≥1 number.
 * (Admin staff have a stricter policy — see rbac/domain/password-policy.ts.)
 */
export const CUSTOMER_PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export function isValidCustomerPassword(password: string): boolean {
  return typeof password === 'string' && CUSTOMER_PASSWORD_REGEX.test(password);
}
