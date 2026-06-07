import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationDispatchService } from './notification-dispatch.service';

/**
 * Promotional quiet-hours deferral sweep (FR-NOTIF-052, §12.10): periodically delivers promotional
 * notifications whose `deferred_until` has elapsed. Same self-managed-interval pattern as the
 * inventory reservation sweep (the repo has no `@nestjs/schedule` dependency yet — swap to `@Cron` if
 * that package is added). Idempotent and overlap-guarded; disabled when the interval is 0 or in tests.
 */
@Injectable()
export class PromotionalDeferralTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PromotionalDeferralTask.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dispatch: NotificationDispatchService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('NOTIF_PROMO_DEFERRAL_SWEEP_MS') ?? 60 * 1000);
  }

  onModuleInit(): void {
    if (this.intervalMs <= 0 || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runSweep(), this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run one sweep; guards against overlapping runs. */
  async runSweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const delivered = await this.dispatch.processDueDeferrals();
      if (delivered > 0) this.logger.log(`Delivered ${delivered} deferred promotional notification(s)`);
    } catch (err) {
      this.logger.error(`Promotional deferral sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
