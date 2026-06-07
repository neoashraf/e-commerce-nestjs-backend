export interface GeneratedOtp {
  code: string;
  hash: string;
}

/** Generates and verifies numeric 2FA codes (hash compared, never the plaintext). */
export interface IAdminOtpService {
  generate(): Promise<GeneratedOtp>;
  compare(code: string, hash: string): Promise<boolean>;
}

export const ADMIN_OTP_SERVICE = Symbol('IAdminOtpService');
