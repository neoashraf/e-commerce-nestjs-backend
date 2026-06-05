import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';

import {
  IVerificationTokenService,
  MintedVerificationToken,
} from '../../application/ports/verification-token.port';

/**
 * Opaque single-use verification tokens (FR-AUTH-043): the raw value goes in the email
 * link; only its SHA-256 hash is persisted (mirrors the refresh-token scheme).
 */
@Injectable()
export class VerificationTokenService implements IVerificationTokenService {
  mint(): MintedVerificationToken {
    const raw = randomBytes(32).toString('hex');
    return { raw, hash: this.hash(raw) };
  }

  hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
