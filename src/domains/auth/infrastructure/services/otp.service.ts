import { randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { IOtpService } from '../../application/ports/otp-service.port';

@Injectable()
export class OtpService implements IOtpService {
  private static readonly SALT_ROUNDS = 10;

  generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  hash(code: string): Promise<string> {
    return bcrypt.hash(code, OtpService.SALT_ROUNDS);
  }

  compare(code: string, hash: string): Promise<boolean> {
    return bcrypt.compare(code, hash);
  }
}
