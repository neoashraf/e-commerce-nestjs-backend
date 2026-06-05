import { Test, TestingModule } from '@nestjs/testing';

import { AuditEntry } from '../../domain/entities/audit-entry.entity';
import { AuditResult } from '../../domain/enums/audit-result.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { AUDIT_REPOSITORY } from '../../domain/repositories/audit.repository.interface';
import { ListAuditUseCase } from '../use-cases/list-audit.use-case';

const entry = (id: string, actorId: string | null, result = AuditResult.SUCCESS) =>
  new AuditEntry(id, actorId, 'rbac.role.update', 'Role', 'r1', {}, null, result, new Date());

describe('RBAC — ListAuditUseCase', () => {
  let useCase: ListAuditUseCase;
  let audit: { findMany: jest.Mock };
  let admins: { findById: jest.Mock };

  beforeEach(async () => {
    audit = { findMany: jest.fn() };
    admins = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListAuditUseCase,
        { provide: AUDIT_REPOSITORY, useValue: audit },
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
      ],
    }).compile();
    useCase = module.get(ListAuditUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('resolves actor names and passes filters through (FR-RBAC-041)', async () => {
    audit.findMany.mockResolvedValue({ items: [entry('au1', 'ad1')], total: 1 });
    admins.findById.mockResolvedValue({ fullName: 'Ops Lead' });

    const result = await useCase.execute({ page: 1, limit: 50, result: AuditResult.SUCCESS });

    expect(audit.findMany).toHaveBeenCalledWith(expect.objectContaining({ result: AuditResult.SUCCESS }));
    expect(result.items[0].actor).toEqual({ id: 'ad1', name: 'Ops Lead' });
    expect(result.total).toBe(1);
  });

  it('returns a null actor for system/anonymous events (e.g. failed login)', async () => {
    audit.findMany.mockResolvedValue({ items: [entry('au2', null, AuditResult.FAILED_LOGIN)], total: 1 });

    const result = await useCase.execute({ page: 1, limit: 50 });

    expect(result.items[0].actor).toBeNull();
    expect(admins.findById).not.toHaveBeenCalled();
  });
});
