import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { isReportKey, ScheduleCadence } from '../../domain/export-enums';
import { ScheduledReportOrmEntity } from '../../infrastructure/persistence/typeorm/entities/scheduled-report.orm-entity';
import { RawReportParams } from './report-params';

export interface CreateScheduleCommand {
  reportKey: string;
  params: RawReportParams;
  cadence: ScheduleCadence;
  recipientsAdminIds: string[];
  isActive: boolean;
}

export type UpdateScheduleCommand = Partial<CreateScheduleCommand>;

/**
 * CRUD for scheduled report digests (FR-RPT-071). A schedule names a report + a (rolling) params template,
 * a cadence, and ≥1 admin recipient; the cadence runner ({@link ScheduleTask}) emails them. Validates the
 * report_key against the catalog and requires at least one recipient (§11 validation). Read-only over
 * report data; gated by `reports.report.schedule` at the controller.
 */
@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(ScheduledReportOrmEntity)
    private readonly schedules: Repository<ScheduledReportOrmEntity>,
  ) {}

  async list(): Promise<ScheduledReportOrmEntity[]> {
    return this.schedules.find({ order: { createdAt: 'DESC' } });
  }

  async create(command: CreateScheduleCommand): Promise<ScheduledReportOrmEntity> {
    this.assertReportKey(command.reportKey);
    this.assertRecipients(command.recipientsAdminIds);
    const row = this.schedules.create({
      reportKey: command.reportKey,
      params: command.params ?? {},
      cadence: command.cadence,
      recipientsAdminIds: command.recipientsAdminIds,
      isActive: command.isActive,
      lastRunAt: null,
      lastRunSkippedAdminIds: null,
    });
    return this.schedules.save(row);
  }

  async update(id: string, command: UpdateScheduleCommand): Promise<ScheduledReportOrmEntity> {
    const row = await this.getOrThrow(id);
    if (command.reportKey !== undefined) {
      this.assertReportKey(command.reportKey);
      row.reportKey = command.reportKey;
    }
    if (command.params !== undefined) row.params = command.params;
    if (command.cadence !== undefined) row.cadence = command.cadence;
    if (command.recipientsAdminIds !== undefined) {
      this.assertRecipients(command.recipientsAdminIds);
      row.recipientsAdminIds = command.recipientsAdminIds;
    }
    if (command.isActive !== undefined) row.isActive = command.isActive;
    return this.schedules.save(row);
  }

  async remove(id: string): Promise<void> {
    const row = await this.getOrThrow(id);
    await this.schedules.remove(row);
  }

  private async getOrThrow(id: string): Promise<ScheduledReportOrmEntity> {
    const row = await this.schedules.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found.' });
    return row;
  }

  private assertReportKey(reportKey: string): void {
    if (!isReportKey(reportKey)) {
      throw new BadRequestException({
        code: 'UNKNOWN_REPORT',
        message: `Unknown report_key \`${reportKey}\`.`,
      });
    }
  }

  private assertRecipients(ids: string[] | undefined): void {
    if (!ids || ids.length === 0) {
      throw new BadRequestException({
        code: 'NO_RECIPIENTS',
        message: 'A schedule requires at least one recipient.',
      });
    }
  }
}
