import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ExportFormat, ReportKey, ScheduleCadence } from '../domain/export-enums';
import { AdminUserStatus } from '../../rbac/domain/enums/admin-user-status.enum';
import { ScheduledReportOrmEntity } from '../infrastructure/persistence/typeorm/entities/scheduled-report.orm-entity';
import { ReportFileStore } from '../infrastructure/report-file-store';
import { ADMIN_DIRECTORY, IAdminDirectory } from './ports/admin-directory.port';
import { IReportNotifier, REPORT_NOTIFIER } from './ports/report-notifier.port';
import { ReportContentService } from './services/report-content.service';
import { ReportSerializerService } from './services/report-serializer.service';

/** Cadence → minimum elapsed time before a schedule is due again. */
const CADENCE_INTERVAL_MS: Record<ScheduleCadence, number> = {
  [ScheduleCadence.DAILY]: 24 * 60 * 60 * 1000,
  [ScheduleCadence.WEEKLY]: 7 * 24 * 60 * 60 * 1000,
  [ScheduleCadence.MONTHLY]: 30 * 24 * 60 * 60 * 1000,
};

/**
 * Scheduled-digest cadence runner (FR-RPT-071, §12.11). On each sweep it finds active schedules whose
 * cadence interval has elapsed since `last_run_at` (or never ran), renders the digest from the rolling
 * params template, and emails each recipient via NOTIF — **skipping recipients who are suspended at send
 * time** and flagging them on the schedule (`last_run_skipped_admin_ids`). `last_run_at` is then stamped.
 * Implemented as a self-managed interval (the repo has no `@nestjs/schedule`; mirrors AutoCancelTask) and
 * is disabled under `NODE_ENV=test` so tests can drive `runDueSchedules()` deterministically.
 */
@Injectable()
export class ScheduleTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduleTask.name);
  private readonly sweepMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(ScheduledReportOrmEntity)
    private readonly schedules: Repository<ScheduledReportOrmEntity>,
    private readonly content: ReportContentService,
    private readonly serializer: ReportSerializerService,
    private readonly fileStore: ReportFileStore,
    @Inject(REPORT_NOTIFIER) private readonly notifier: IReportNotifier,
    @Inject(ADMIN_DIRECTORY) private readonly admins: IAdminDirectory,
    config: ConfigService,
  ) {
    this.sweepMs = Number(config.get('REPORTS_SCHEDULE_SWEEP_MS') ?? 60 * 60 * 1000);
  }

  onModuleInit(): void {
    if (this.sweepMs <= 0 || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runDueSchedules(), this.sweepMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One sweep: run every active, due schedule. Overlap-guarded; per-schedule failures are isolated. */
  async runDueSchedules(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const active = await this.schedules.find({ where: { isActive: true } });
      let ran = 0;
      for (const schedule of active) {
        if (!this.isDue(schedule, now)) continue;
        try {
          await this.runSchedule(schedule, now);
          ran += 1;
        } catch (err) {
          this.logger.error(`Schedule ${schedule.id} failed: ${(err as Error).message}`);
        }
      }
      return ran;
    } finally {
      this.running = false;
    }
  }

  private isDue(schedule: ScheduledReportOrmEntity, now: Date): boolean {
    if (!schedule.lastRunAt) return true;
    return now.getTime() - schedule.lastRunAt.getTime() >= CADENCE_INTERVAL_MS[schedule.cadence];
  }

  /** Render the digest once and email each active recipient; flag suspended ones; stamp last_run_at. */
  async runSchedule(schedule: ScheduledReportOrmEntity, now: Date): Promise<void> {
    const table = await this.content.render(schedule.reportKey as ReportKey, schedule.params, now);
    const file = await this.serializer.serialize(table, ExportFormat.CSV);
    const stored = await this.fileStore.save(`sch-${schedule.id}-${now.getTime()}`, schedule.reportKey, file, now);

    const recipients = await this.admins.resolve(schedule.recipientsAdminIds);
    const byId = new Map(recipients.map((r) => [r.id, r]));
    const skipped: string[] = [];

    for (const adminId of schedule.recipientsAdminIds) {
      const recipient = byId.get(adminId);
      if (!recipient || recipient.status !== AdminUserStatus.ACTIVE) {
        skipped.push(adminId);
        continue;
      }
      await this.notifier.notify('report.digest', {
        adminId,
        email: recipient.email,
        reportKey: schedule.reportKey,
        fileUrl: stored.fileUrl,
        refId: schedule.id,
        expiresAt: stored.expiresAt.toISOString(),
      });
    }

    if (skipped.length > 0) {
      this.logger.warn(`Schedule ${schedule.id}: skipped ${skipped.length} suspended/unknown recipient(s).`);
    }
    schedule.lastRunAt = now;
    schedule.lastRunSkippedAdminIds = skipped.length > 0 ? skipped : null;
    await this.schedules.save(schedule);
  }
}
