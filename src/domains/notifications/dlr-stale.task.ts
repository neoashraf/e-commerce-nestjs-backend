import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationDispatchService } from './notification-dispatch.service';

/**
 * DLR stale sweep (FR-NOTIF-041, §12.2 edge case 2): periodically marks `sent` notifications whose
 * delivery receipt never arrived — past a configurable age — as `unknown`, so the log never shows a
 * false `delivered`. Same self-managed-interval pattern as `PromotionalDeferralTask` (the repo has
 * no `@nestjs/schedule` dependency yet). Idempotent and overlap-guarded; disabled when the sweep
 * interval is 0 or in tests.
 */
@Injectable()
export class DlrStaleTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DlrStaleTask.name);
  private readonly intervalMs: number;
  private readonly maxAgeMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly dispatch: NotificationDispatchService,
    config: ConfigService,
  ) {
    // How often to sweep (default 5 min) and how old a `sent` message must be to be stale (default 6h).
    this.intervalMs = Number(config.get('NOTIF_DLR_STALE_SWEEP_MS') ?? 5 * 60 * 1000);
    this.maxAgeMs = Number(config.get('NOTIF_DLR_STALE_AGE_MS') ?? 6 * 60 * 60 * 1000);
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
      const swept = await this.dispatch.sweepStaleSent(this.maxAgeMs);
      if (swept > 0) this.logger.log(`Marked ${swept} stale 'sent' notification(s) as 'unknown'`);
    } catch (err) {
      this.logger.error(`DLR stale sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
