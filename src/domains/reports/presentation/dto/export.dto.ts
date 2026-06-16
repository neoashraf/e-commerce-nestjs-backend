import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, Max, Min } from 'class-validator';

import { ExportFormat, ExportStatus, ReportKey } from '../../domain/export-enums';

// ── Request ──────────────────────────────────────────────────────────────────

/** `POST /admin/reports/export` body (FR-RPT-070/072). */
export class CreateExportDto {
  @ApiProperty({ enum: ReportKey, description: 'Report family to export', example: ReportKey.SALES })
  @IsEnum(ReportKey)
  report_key: ReportKey;

  @ApiProperty({
    type: Object,
    description: 'Period + filters used for the report (e.g. { from, to, bucket })',
    example: { from: '2026-05-01', to: '2026-05-31', bucket: 'day' },
  })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiProperty({ enum: ExportFormat, description: 'Output format', example: ExportFormat.CSV })
  @IsEnum(ExportFormat)
  format: ExportFormat;
}

// ── Responses ────────────────────────────────────────────────────────────────

/** `202` accepted-export envelope payload. */
export class ExportAcceptedDto {
  @ApiProperty({ description: 'Export id (poll for status)', format: 'uuid' })
  export_id: string;

  @ApiProperty({ enum: ExportStatus, example: ExportStatus.PROCESSING })
  status: ExportStatus;
}

/** Export status / download payload. */
export class ExportStatusDto {
  @ApiProperty({ enum: ExportStatus })
  status: ExportStatus;

  @ApiProperty({ nullable: true, description: 'Download URL when ready (expiring link)' })
  file_url: string | null;

  @ApiProperty({ nullable: true, description: 'Link expiry (ISO datetime)' })
  expires_at: string | null;
}

/** `GET /admin/reports/exports` query (paginated list of the requester's exports). */
export class ListExportsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** One row of the export-manager list (FR-RPT-070/072). */
export class ExportListItemDto {
  @ApiProperty({ format: 'uuid', description: 'Export id' })
  id: string;

  @ApiProperty({ enum: ReportKey, description: 'Report family that was exported' })
  report_key: string;

  @ApiProperty({ enum: ExportFormat })
  format: ExportFormat;

  @ApiProperty({ enum: ExportStatus })
  status: ExportStatus;

  @ApiProperty({ nullable: true, description: 'Download URL when ready (expiring link)' })
  file_url: string | null;

  @ApiProperty({ nullable: true, description: 'Link expiry (ISO datetime)' })
  expires_at: string | null;

  @ApiProperty({ description: 'When the export was requested (ISO datetime)' })
  created_at: string;
}
