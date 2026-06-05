import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Role } from '../../domain/entities/role.entity';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { AuditService } from '../services/audit.service';
import { CreateRoleUseCase } from '../use-cases/create-role.use-case';

describe('RBAC — CreateRoleUseCase', () => {
  let useCase: CreateRoleUseCase;
  let roles: { findByName: jest.Mock; saveRole: jest.Mock; replacePermissions: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    roles = {
      findByName: jest.fn(),
      saveRole: jest.fn().mockImplementation((r: Role) => Promise.resolve(r)),
      replacePermissions: jest.fn().mockResolvedValue(undefined),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateRoleUseCase,
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(CreateRoleUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a custom role with a valid permission set (FR-RBAC-021)', async () => {
    roles.findByName.mockResolvedValue(null);
    const result = await useCase.execute({
      actorAdminId: 'ad1',
      name: 'Junior Catalog',
      permissions: ['dashboard.view', 'catalog.product.read'],
    });
    expect(result.name).toBe('Junior Catalog');
    expect(roles.replacePermissions).toHaveBeenCalledWith(expect.any(String), ['dashboard.view', 'catalog.product.read']);
  });

  it('rejects a duplicate role name with 400', async () => {
    roles.findByName.mockResolvedValue(new Role('r', 'Junior Catalog', null, false, new Date(), new Date(), null));
    await expect(
      useCase.execute({ actorAdminId: 'ad1', name: 'Junior Catalog', permissions: ['dashboard.view'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown permission code with 400', async () => {
    roles.findByName.mockResolvedValue(null);
    await expect(
      useCase.execute({ actorAdminId: 'ad1', name: 'X', permissions: ['not.a.real.code'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(roles.saveRole).not.toHaveBeenCalled();
  });
});
