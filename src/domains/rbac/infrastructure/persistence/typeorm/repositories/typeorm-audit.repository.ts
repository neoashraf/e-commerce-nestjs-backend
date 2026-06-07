import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditResult } from '../../../../domain/enums/audit-result.enum';
import { AuditEntry } from '../../../../domain/entities/audit-entry.entity';
import {
  AuditQueryFilter,
  IAuditRepository,
} from '../../../../domain/repositories/audit.repository.interface';
import { AuditEntryOrmEntity } from '../entities/audit-entry.orm-entity';

/** Append-only writes; reads are filtered/paginated only. No update/delete (FR-RBAC-042). */
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

  async findMany(filter: AuditQueryFilter): Promise<{ items: AuditEntry[]; total: number }> {
    const qb = this.repo.createQueryBuilder('a');
    if (filter.actorAdminId) qb.andWhere('a.actorAdminId = :actor', { actor: filter.actorAdminId });
    if (filter.action) qb.andWhere('a.action = :action', { action: filter.action });
    if (filter.entityType) qb.andWhere('a.entityType = :et', { et: filter.entityType });
    if (filter.result) qb.andWhere('a.result = :result', { result: filter.result });
    if (filter.from) qb.andWhere('a.createdAt >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('a.createdAt <= :to', { to: filter.to });
    qb.orderBy('a.createdAt', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);
    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((o) => TypeOrmAuditRepository.toDomain(o)), total };
  }

  private static toDomain(o: AuditEntryOrmEntity): AuditEntry {
    return new AuditEntry(
      o.id,
      o.actorAdminId,
      o.action,
      o.entityType,
      o.entityId,
      o.summary,
      o.ipAddress,
      o.result as AuditResult,
      o.createdAt,
    );
  }
}
