import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { AuditEntry } from '../../domain/entities/audit-entry.entity';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import {
  AUDIT_REPOSITORY,
  IAuditRepository,
} from '../../domain/repositories/audit.repository.interface';

export interface RecordAuditInput {
  actorAdminId: string | null;
  action: string;
  result: AuditResult;
  entityType?: string | null;
  entityId?: string | null;
  summary?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Append-only audit writer (FR-RBAC-040, 043). The reusable hook for state-changing
 * permissioned actions and security events (failed login, 403). Audit-write failure
 * never bubbles up to fail the underlying request — it is logged for monitoring
 * (audit-integrity, §12.9). There is no update/delete path (FR-RBAC-042).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(AUDIT_REPOSITORY) private readonly audit: IAuditRepository) {}

  async record(input: RecordAuditInput): Promise<void> {
    const entry = new AuditEntry(
      randomUUID(),
      input.actorAdminId,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.summary ?? {},
      input.ipAddress ?? null,
      input.result,
      new Date(),
    );
    try {
      await this.audit.append(entry);
    } catch (err) {
      this.logger.error(
        `Audit write failed for action="${input.action}" result="${input.result}"`,
        (err as Error)?.stack,
      );
    }
  }
}
