import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ReservationService } from './reservation.service';

/**
 * Reservation expiry sweep (FR-INV-021): periodically releases `held` reservations past `expires_at`,
 * restoring `available`. Implemented with a self-managed interval driven by NestJS lifecycle hooks
 * (the repo has no `@nestjs/schedule` dependency yet — see the PR note); swap to `@Cron` if/when that
 * package is added. The sweep is idempotent and concurrency-safe (each order released in its own
 * row-locked transaction), so overlapping runs cannot double-release. Disabled when the interval is 0
 * (e.g. tests run the sweep manually).
 */
@Injectable()
export class ReservationExpiryTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReservationExpiryTask.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly reservations: ReservationService,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('INVENTORY_RESERVATION_SWEEP_MS') ?? 60 * 1000);
  }

  onModuleInit(): void {
    if (this.intervalMs <= 0 || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runSweep(), this.intervalMs);
    // Don't keep the process alive solely for the sweep.
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
      await this.reservations.releaseExpiredReservations();
    } catch (err) {
      this.logger.error(`Reservation expiry sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
