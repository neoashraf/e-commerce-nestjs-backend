import { TwofaChannel } from '../enums/twofa-channel.enum';
import { TwofaPurpose } from '../enums/twofa-purpose.enum';

/**
 * Transient pending 2FA challenge (FR-RBAC-002/008/009): the login second step, the
 * enable-confirm code, or the disable proof-of-control code — bound by `purpose` so a
 * code issued for one flow can never complete another. `rememberDevice` is captured at
 * login so the verify step issues the correct 90d/30d refresh TTL.
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
    public readonly purpose: TwofaPurpose = TwofaPurpose.LOGIN,
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
