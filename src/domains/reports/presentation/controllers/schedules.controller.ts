import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { ScheduledReportOrmEntity } from '../../infrastructure/persistence/typeorm/entities/scheduled-report.orm-entity';
import { SchedulesService } from '../../application/services/schedules.service';
import {
  CreateScheduleDto,
  ScheduleCreatedDto,
  ScheduleDto,
  UpdateScheduleDto,
} from '../dto/schedule.dto';

/**
 * Scheduled report digests (RPT — FR-RPT-071). CRUD over recurring report emails; the cadence runner
 * ({@link ScheduleTask}) delivers them via NOTIF and skips suspended recipients. Gated by
 * `reports.report.schedule` (the RBAC catalog code; the contract names it `reports.schedule.manage`).
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/reports/schedules')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get()
  @Requires('reports.report.schedule')
  @ApiOperation({ summary: 'List scheduled report digests' })
  @ApiOkResponse({ type: [ScheduleDto] })
  async list(): Promise<ScheduleDto[]> {
    const rows = await this.schedules.list();
    return rows.map((r) => this.toDto(r));
  }

  @Post()
  @Requires('reports.report.schedule')
  @ApiOperation({ summary: 'Create a scheduled report digest' })
  @ApiCreatedResponse({ type: ScheduleCreatedDto })
  async create(@Body() dto: CreateScheduleDto): Promise<ScheduleCreatedDto> {
    const row = await this.schedules.create({
      reportKey: dto.report_key,
      params: dto.params ?? {},
      cadence: dto.cadence,
      recipientsAdminIds: dto.recipients_admin_ids,
      isActive: dto.is_active ?? true,
    });
    return { id: row.id };
  }

  @Patch(':id')
  @Requires('reports.report.schedule')
  @ApiOperation({ summary: 'Update a scheduled report digest' })
  @ApiOkResponse({ type: ScheduleDto })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateScheduleDto,
  ): Promise<ScheduleDto> {
    const row = await this.schedules.update(id, {
      reportKey: dto.report_key,
      params: dto.params,
      cadence: dto.cadence,
      recipientsAdminIds: dto.recipients_admin_ids,
      isActive: dto.is_active,
    });
    return this.toDto(row);
  }

  @Delete(':id')
  @HttpCode(204)
  @Requires('reports.report.schedule')
  @ApiOperation({ summary: 'Delete a scheduled report digest' })
  @ApiNoContentResponse({ description: 'Schedule deleted' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.schedules.remove(id);
  }

  private toDto(row: ScheduledReportOrmEntity): ScheduleDto {
    return {
      id: row.id,
      report_key: row.reportKey as ScheduleDto['report_key'],
      params: row.params,
      cadence: row.cadence,
      recipients_admin_ids: row.recipientsAdminIds,
      is_active: row.isActive,
      last_run_at: row.lastRunAt ? row.lastRunAt.toISOString() : null,
      last_run_skipped_admin_ids: row.lastRunSkippedAdminIds,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    };
  }
}
