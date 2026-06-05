import { AuditEntry } from '../entities/audit-entry.entity';

/** Append-only: insert is the only write. No update/delete path (FR-RBAC-042). */
export interface IAuditRepository {
  append(entry: AuditEntry): Promise<void>;
}

export const AUDIT_REPOSITORY = Symbol('IAuditRepository');
