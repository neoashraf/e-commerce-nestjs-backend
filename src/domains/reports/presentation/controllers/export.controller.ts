import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { ExportService } from '../../application/services/export.service';
import { CreateExportDto, ExportAcceptedDto, ExportStatusDto } from '../dto/export.dto';

/**
 * Async report export (RPT — FR-RPT-070/072). `POST` validates + enqueues an export and returns `202`
 * with the export id; `GET …/{exportId}` polls for status + an expiring download link. Gated by
 * `reports.report.export` (the RBAC catalog code; the contract names it `reports.export`).
 */
@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/reports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('export')
  @HttpCode(202)
  @Requires('reports.report.export')
  @ApiOperation({ summary: 'Generate a report export (async; CSV/PDF) — returns 202 + export id' })
  @ApiCreatedResponse({ type: ExportAcceptedDto, description: '202 — export accepted and processing' })
  async create(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: CreateExportDto,
  ): Promise<ExportAcceptedDto> {
    const row = await this.exportService.createExport({
      reportKey: dto.report_key,
      params: dto.params ?? {},
      format: dto.format,
      adminId: admin.adminId,
    });
    return { export_id: row.id, status: row.status };
  }

  @Get('export/:exportId')
  @Requires('reports.report.export')
  @ApiOperation({ summary: 'Export status + download link' })
  @ApiOkResponse({ type: ExportStatusDto })
  async status(
    @Param('exportId', new ParseUUIDPipe()) exportId: string,
  ): Promise<ExportStatusDto> {
    const row = await this.exportService.getExport(exportId);
    return {
      status: row.status,
      file_url: row.fileUrl,
      expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    };
  }
}
