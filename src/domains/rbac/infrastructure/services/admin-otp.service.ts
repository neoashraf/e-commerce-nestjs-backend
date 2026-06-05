import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';

import { GeneratedOtp, IAdminOtpService } from '../../application/ports/admin-otp.port';

/** 6-digit numeric 2FA codes; only the sha256 hash is stored, compared in constant time. */
@Injectable()
export class AdminOtpService implements IAdminOtpService {
  async generate(): Promise<GeneratedOtp> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    return { code, hash: this.hash(code) };
  }

  async compare(code: string, hash: string): Promise<boolean> {
    const a = Buffer.from(this.hash(code), 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
