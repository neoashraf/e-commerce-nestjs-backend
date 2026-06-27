/** The identity claims AUTH needs from a verified Google ID token. */
export interface GoogleProfile {
  /** Lower-cased, verified Google account email. */
  email: string;
  /** Whether Google asserts the email is verified (we reject sign-in otherwise). */
  emailVerified: boolean;
  /** Display name, when the user granted the profile scope. */
  name: string | null;
  /** Stable Google account id (`sub`). */
  sub: string;
}

/**
 * Verifies a Google Identity Services credential (ID token) and returns its identity claims, or
 * throws `401` for an invalid/forged token. The real adapter validates the token against Google and
 * checks `aud` matches our configured `GOOGLE_CLIENT_ID`; swappable so it can be mocked in tests.
 */
export interface IGoogleVerifier {
  verify(idToken: string): Promise<GoogleProfile>;
}

export const GOOGLE_VERIFIER = Symbol('GOOGLE_VERIFIER');
