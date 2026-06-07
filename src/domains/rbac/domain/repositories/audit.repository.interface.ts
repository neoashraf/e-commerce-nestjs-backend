import { AuditResult } from '../enums/audit-result.enum';
import { AuditEntry } from '../entities/audit-entry.entity';

export interface AuditQueryFilter {
  actorAdminId?: string;
  action?: string;
  entityType?: string;
  result?: AuditResult;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

/** Append-only writes; reads are filter/paginate only — no update/delete path (FR-RBAC-042). */
export interface IAuditRepository {
  append(entry: AuditEntry): Promise<void>;
  /** Newest-first, filtered, paginated read of the audit trail (FR-RBAC-041). */
  findMany(filter: AuditQueryFilter): Promise<{ items: AuditEntry[]; total: number }>;
}

export const AUDIT_REPOSITORY = Symbol('IAuditRepository');
