import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditEntry } from '../../../../domain/entities/audit-entry.entity';
import { IAuditRepository } from '../../../../domain/repositories/audit.repository.interface';
import { AuditEntryOrmEntity } from '../entities/audit-entry.orm-entity';

/** Append-only: only `INSERT`. No update/delete methods exist (FR-RBAC-042). */
@Injectable()
export class TypeOrmAuditRepository implements IAuditRepository {
  constructor(
    @InjectRepository(AuditEntryOrmEntity)
    private readonly repo: Repository<AuditEntryOrmEntity>,
  ) {}

  async append(entry: AuditEntry): Promise<void> {
    const orm = new AuditEntryOrmEntity();
    orm.id = entry.id;
    orm.actorAdminId = entry.actorAdminId;
    orm.action = entry.action;
    orm.entityType = entry.entityType;
    orm.entityId = entry.entityId;
    orm.summary = entry.summary;
    orm.ipAddress = entry.ipAddress;
    orm.result = entry.result;
    await this.repo.save(orm);
  }
}
