import { Inject, Injectable } from '@nestjs/common';

import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  ADMIN_USER_REPOSITORY,
  IAdminUserRepository,
} from '../../domain/repositories/admin-user.repository.interface';
import { AUDIT_REPOSITORY, IAuditRepository } from '../../domain/repositories/audit.repository.interface';

export interface ListAuditQuery {
  actorAdminId?: string;
  action?: string;
  entityType?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export interface AuditRow {
  id: string;
  actor: { id: string; name: string } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  result: AuditResult;
  summary: Record<string, unknown>;
  createdAt: Date;
}

export interface ListAuditResult {
  items: AuditRow[];
  total: number;
  page: number;
  limit: number;
}

/** Filtered, paginated, newest-first read of the audit trail with actor names (FR-RBAC-041). */
@Injectable()
export class ListAuditUseCase {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly audit: IAuditRepository,
    @Inject(ADMIN_USER_REPOSITORY) private readonly admins: IAdminUserRepository,
  ) {}

  async execute(query: ListAuditQuery): Promise<ListAuditResult> {
    const { items, total } = await this.audit.findMany(query);

    const names = new Map<string, string>();
    for (const entry of items) {
      if (entry.actorAdminId && !names.has(entry.actorAdminId)) {
        const admin = await this.admins.findById(entry.actorAdminId);
        names.set(entry.actorAdminId, admin?.fullName ?? 'Unknown');
      }
    }

    return {
      items: items.map((e) => ({
        id: e.id,
        actor: e.actorAdminId
          ? { id: e.actorAdminId, name: names.get(e.actorAdminId) ?? 'Unknown' }
          : null,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        result: e.result,
        summary: e.summary,
        createdAt: e.createdAt,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
