/** Admin password policy: ≥10 chars, ≥1 upper, ≥1 lower, ≥1 number (SRS 16 §11). */
export const ADMIN_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;

export function isValidAdminPassword(password: string): boolean {
  return ADMIN_PASSWORD_REGEX.test(password);
}
