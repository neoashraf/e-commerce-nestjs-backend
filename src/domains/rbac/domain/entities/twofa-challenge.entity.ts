import { TwofaChannel } from '../enums/twofa-channel.enum';

/**
 * Transient pending 2FA challenge issued after a valid password, completed via
 * `POST /admin/auth/2fa/verify` (FR-RBAC-002). Support state for the documented
 * login flow (not a business aggregate). `rememberDevice` is captured at login so
 * the verify step issues the correct 90d/30d refresh TTL.
 */
export class TwofaChallenge {
  constructor(
    public readonly id: string,
    public readonly adminUserId: string,
    public otpHash: string,
    public readonly channel: TwofaChannel,
    public readonly rememberDevice: boolean,
    public attempts: number,
    public expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  isConsumed(): boolean {
    return this.consumedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  attemptsExhausted(cap: number): boolean {
    return this.attempts >= cap;
  }

  registerFailedAttempt(): void {
    this.attempts += 1;
  }

  consume(now: Date): void {
    this.consumedAt = now;
  }
}
