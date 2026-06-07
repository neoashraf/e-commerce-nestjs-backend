/**
 * Bangladesh mobile number value object.
 * Normalizes any accepted input to E.164 `+8801XXXXXXXXX` (FR-AUTH-005, SRS §11).
 * Valid BD mobile = `+880` + `1` + operator digit `3–9` + 8 more digits.
 */
export class BdPhone {
  private static readonly E164 = /^\+8801[3-9]\d{8}$/;

  private constructor(public readonly value: string) {}

  /** Returns the E.164 string, or `null` if the input is not a valid BD mobile. */
  static toE164(raw: string | null | undefined): string | null {
    if (!raw) return null;
    let digits = raw.replace(/[\s-]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    if (digits.startsWith('880')) digits = digits.slice(3);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    const e164 = `+880${digits}`;
    return BdPhone.E164.test(e164) ? e164 : null;
  }

  static isValid(raw: string | null | undefined): boolean {
    return BdPhone.toE164(raw) !== null;
  }

  /** Throws nothing — use `toE164` for validation. Builds a VO from an already-normalized value. */
  static of(e164: string): BdPhone {
    return new BdPhone(e164);
  }
}
