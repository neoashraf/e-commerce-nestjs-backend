import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { Paginated } from '../../../../shared/dto/paginated';
import { SkipEnvelope } from '../../../../shared/decorators/skip-envelope.decorator';
import { AuditRow, ListAuditUseCase } from '../../application/use-cases/list-audit.use-case';
import { Requires } from '../decorators/requires.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { ListAuditQueryDto } from '../dto/list-audit.dto';
import { AuditEntryDto } from '../dto/audit-response.dto';

/** Max rows a single CSV export will include (keeps the response bounded). */
const EXPORT_LIMIT = 5000;

@ApiTags('Admin Audit')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(JwtAdminGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly listAudit: ListAuditUseCase) {}

  @Get()
  @Requires('rbac.audit.read')
  @ApiOperation({ summary: 'List audit entries (filter/paginate, newest first) (FR-RBAC-041)' })
  @ApiOkResponse({ type: AuditEntryDto, isArray: true })
  async list(@Query() query: ListAuditQueryDto): Promise<Paginated<AuditEntryDto>> {
    const result = await this.listAudit.execute({
      actorAdminId: query.actor,
      action: query.action,
      entityType: query.entity_type,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? AuditController.endOfDay(query.to) : undefined,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
    return new Paginated(result.items.map(AuditController.toDto), {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  }

  @Get('export')
  @Requires('rbac.audit.read')
  @SkipEnvelope()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Export the audit log (CSV) honoring the active filters (FR-RBAC-041)' })
  async export(@Query() query: ListAuditQueryDto, @Res() res: Response): Promise<void> {
    const result = await this.listAudit.execute({
      actorAdminId: query.actor,
      action: query.action,
      entityType: query.entity_type,
      result: query.result,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? AuditController.endOfDay(query.to) : undefined,
      page: 1,
      limit: EXPORT_LIMIT,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(AuditController.toCsv(result.items));
  }

  private static endOfDay(iso: string): Date {
    const d = new Date(iso);
    d.setUTCHours(23, 59, 59, 999);
    return d;
  }

  private static toDto(row: AuditRow): AuditEntryDto {
    return {
      id: row.id,
      actor: row.actor,
      action: row.action,
      entity_type: row.entityType,
      entity_id: row.entityId,
      result: row.result,
      summary: row.summary,
      created_at: row.createdAt.toISOString(),
    };
  }

  private static toCsv(rows: AuditRow[]): string {
    const header = ['id', 'created_at', 'actor_id', 'actor_name', 'action', 'entity_type', 'entity_id', 'result', 'summary'];
    const escape = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.createdAt.toISOString(),
          r.actor?.id ?? '',
          r.actor?.name ?? '',
          r.action,
          r.entityType ?? '',
          r.entityId ?? '',
          r.result,
          JSON.stringify(r.summary ?? {}),
        ]
          .map(escape)
          .join(','),
      );
    }
    return lines.join('\n');
  }
}
