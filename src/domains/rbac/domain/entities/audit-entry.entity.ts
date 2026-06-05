import { AuditResult } from '../enums/audit-result.enum';

/**
 * Immutable, append-only record of a permissioned/security admin event
 * (SRS 16 §8 AuditEntry; FR-RBAC-040, 042, 043). Never updated or deleted.
 */
export class AuditEntry {
  constructor(
    public readonly id: string,
    public readonly actorAdminId: string | null,
    public readonly action: string,
    public readonly entityType: string | null,
    public readonly entityId: string | null,
    public readonly summary: Record<string, unknown>,
    public readonly ipAddress: string | null,
    public readonly result: AuditResult,
    public readonly createdAt: Date,
  ) {}
}
