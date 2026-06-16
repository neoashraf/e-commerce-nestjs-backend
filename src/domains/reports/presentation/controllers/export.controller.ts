import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { ReportExportOrmEntity } from '../../infrastructure/persistence/typeorm/entities/report-export.orm-entity';
import { ExportService } from '../../application/services/export.service';
import {
  CreateExportDto,
  ExportAcceptedDto,
  ExportListItemDto,
  ExportStatusDto,
  ListExportsQueryDto,
} from '../dto/export.dto';

/**
 * Async report export (RPT — FR-RPT-070/072). `POST` validates + enqueues an export and returns `202`
 * with the export id; `GET …/exports` lists the requester's exports (newest first, paginated); `GET
 * …/export/{exportId}` polls for status + an expiring download link. Gated by `reports.report.export`.
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

  @Get('exports')
  @Requires('reports.report.export')
  @ApiOperation({ summary: "List the requester's exports (newest first, paginated)" })
  @ApiOkResponse({ type: ExportListItemDto, isArray: true })
  async list(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query() query: ListExportsQueryDto,
  ): Promise<Paginated<ExportListItemDto>> {
    const result = await this.exportService.listExports(
      admin.adminId,
      query.page ?? 1,
      query.limit ?? 20,
    );
    return new Paginated(result.items.map(ExportController.toListDto), {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
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

  private static toListDto(row: ReportExportOrmEntity): ExportListItemDto {
    return {
      id: row.id,
      report_key: row.reportKey,
      format: row.format,
      status: row.status,
      file_url: row.fileUrl,
      expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
      created_at: row.createdAt.toISOString(),
    };
  }
}
