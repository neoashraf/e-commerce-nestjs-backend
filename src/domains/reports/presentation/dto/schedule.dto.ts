import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { ReportKey, ScheduleCadence } from '../../domain/export-enums';

// ── Requests ─────────────────────────────────────────────────────────────────

/** `POST /admin/reports/schedules` body (FR-RPT-071). */
export class CreateScheduleDto {
  @ApiProperty({ enum: ReportKey, example: ReportKey.SALES })
  @IsEnum(ReportKey)
  report_key: ReportKey;

  @ApiProperty({
    type: Object,
    description: 'Rolling params template (e.g. { range: "last_7d", bucket: "day" })',
    example: { range: 'last_7d', bucket: 'day' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiProperty({ enum: ScheduleCadence, example: ScheduleCadence.WEEKLY })
  @IsEnum(ScheduleCadence)
  cadence: ScheduleCadence;

  @ApiProperty({ type: [String], format: 'uuid', description: 'Admin recipients to email' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  recipients_admin_ids: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** `PATCH /admin/reports/schedules/{id}` body — all fields optional. */
export class UpdateScheduleDto {
  @ApiPropertyOptional({ enum: ReportKey })
  @IsOptional()
  @IsEnum(ReportKey)
  report_key?: ReportKey;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: ScheduleCadence })
  @IsOptional()
  @IsEnum(ScheduleCadence)
  cadence?: ScheduleCadence;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  recipients_admin_ids?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

// ── Responses ────────────────────────────────────────────────────────────────

/** A scheduled digest (list/detail). */
export class ScheduleDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ReportKey })
  report_key: ReportKey;

  @ApiProperty({ type: Object })
  params: Record<string, unknown>;

  @ApiProperty({ enum: ScheduleCadence })
  cadence: ScheduleCadence;

  @ApiProperty({ type: [String], format: 'uuid' })
  recipients_admin_ids: string[];

  @ApiProperty()
  is_active: boolean;

  @ApiProperty({ nullable: true, description: 'Last execution (ISO datetime)' })
  last_run_at: string | null;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    nullable: true,
    description: 'Recipients skipped on the last run because they were suspended (FR-RPT-071, §12.11)',
  })
  last_run_skipped_admin_ids: string[] | null;

  @ApiProperty()
  created_at: string;

  @ApiProperty()
  updated_at: string;
}

/** `201` created-schedule envelope payload. */
export class ScheduleCreatedDto {
  @ApiProperty({ format: 'uuid' })
  id: string;
}
