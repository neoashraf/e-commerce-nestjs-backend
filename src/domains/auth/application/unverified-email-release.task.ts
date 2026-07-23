import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CUSTOMER_REPOSITORY,
  ICustomerRepository,
} from '../domain/repositories/customer.repository.interface';

/**
 * Unverified-registration email release (FR-AUTH-045): periodically clears the email of
 * email+password registrations that stayed unverified for the release window (default
 * 72 h) with no successful login since registering — so a squatter cannot permanently
 * block an address's real owner. Same self-managed-interval pattern as
 * ReservationExpiryTask (no `@nestjs/schedule` dependency in this repo). The sweep is a
 * single idempotent UPDATE, so overlapping runs are harmless. Disabled when the interval
 * is 0 or under test.
 */
@Injectable()
export class UnverifiedEmailReleaseTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnverifiedEmailReleaseTask.name);
  private readonly intervalMs: number;
  private readonly releaseHours: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: ICustomerRepository,
    config: ConfigService,
  ) {
    this.intervalMs = Number(config.get('AUTH_EMAIL_RELEASE_SWEEP_MS') ?? 3600 * 1000);
    this.releaseHours = Number(config.get('AUTH_EMAIL_RELEASE_HOURS') ?? 72);
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
      const now = new Date();
      const cutoff = new Date(now.getTime() - this.releaseHours * 3600 * 1000);
      const released = await this.customers.releaseUnverifiedEmails(cutoff, now);
      if (released > 0) {
        this.logger.log(`Released ${released} unverified registration email(s) (FR-AUTH-045).`);
      }
    } catch (err) {
      this.logger.error(`Unverified-email release sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
