import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { Role } from '../../domain/entities/role.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { PASSWORD_RESET_TOKEN_REPOSITORY } from '../../domain/repositories/password-reset-token.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { ADMIN_NOTIFICATION_DISPATCHER } from '../ports/admin-notification.port';
import { RBAC_CONFIG } from '../ports/rbac-config.port';
import { AuditService } from '../services/audit.service';
import { InviteAdminUserUseCase } from '../use-cases/invite-admin-user.use-case';

describe('RBAC — InviteAdminUserUseCase', () => {
  let useCase: InviteAdminUserUseCase;
  let admins: { findByEmail: jest.Mock; save: jest.Mock };
  let roles: { findById: jest.Mock };
  let resets: { save: jest.Mock };
  let notifier: { dispatchAdminInvite: jest.Mock };
  let audit: { record: jest.Mock };

  const config = { resetTokenTtlSeconds: 3600, adminPanelUrl: 'https://admin.test' };

  beforeEach(async () => {
    admins = {
      findByEmail: jest.fn(),
      save: jest.fn().mockImplementation((a: AdminUser) => Promise.resolve(a)),
    };
    roles = { findById: jest.fn() };
    resets = { save: jest.fn().mockResolvedValue(undefined) };
    notifier = { dispatchAdminInvite: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteAdminUserUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: PASSWORD_RESET_TOKEN_REPOSITORY, useValue: resets },
        { provide: ADMIN_NOTIFICATION_DISPATCHER, useValue: notifier },
        { provide: RBAC_CONFIG, useValue: config },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(InviteAdminUserUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('creates a pending admin and sends a set-password link (FR-RBAC-010)', async () => {
    admins.findByEmail.mockResolvedValue(null);
    roles.findById.mockResolvedValue(new Role('r1', 'Order Manager', null, true, new Date(), new Date(), null));

    const result = await useCase.execute({
      actorAdminId: 'ad0',
      fullName: 'New Ops',
      email: 'NewOps@store.com',
      roleId: 'r1',
    });

    expect(result.status).toBe(AdminUserStatus.PENDING);
    expect(result.inviteSent).toBe(true);
    expect(resets.save).toHaveBeenCalled();
    // Uses the invite template (not the password-reset one) with an accept-invite link.
    expect(notifier.dispatchAdminInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newops@store.com',
        inviteUrl: expect.stringContaining('/accept-invite?token='),
      }),
    );
  });

  it('rejects a duplicate email with 409', async () => {
    admins.findByEmail.mockResolvedValue({} as AdminUser);
    await expect(
      useCase.execute({ actorAdminId: 'ad0', fullName: 'X', email: 'dup@store.com', roleId: 'r1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an unknown role with 404', async () => {
    admins.findByEmail.mockResolvedValue(null);
    roles.findById.mockResolvedValue(null);
    await expect(
      useCase.execute({ actorAdminId: 'ad0', fullName: 'X', email: 'x@store.com', roleId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
