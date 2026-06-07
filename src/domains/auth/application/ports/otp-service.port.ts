export interface IOtpService {
  /** 6-digit numeric code (FR-AUTH-020). */
  generateCode(): string;
  hash(code: string): Promise<string>;
  compare(code: string, hash: string): Promise<boolean>;
}

export const OTP_SERVICE = Symbol('IOtpService');
