import { HttpException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AdminUser } from '../../domain/entities/admin-user.entity';
import { Role } from '../../domain/entities/role.entity';
import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import { SUPER_ADMIN_ROLE_NAME } from '../../domain/permission-catalog';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { ROLE_REPOSITORY } from '../../domain/repositories/role.repository.interface';
import { PASSWORD_HASHER } from '../ports/password-hasher.port';
import { AuditService } from '../services/audit.service';
import { UpdateAdmin2faUseCase } from '../use-cases/update-admin-2fa.use-case';

describe('RBAC — UpdateAdmin2faUseCase', () => {
  let useCase: UpdateAdmin2faUseCase;
  let admins: { findById: jest.Mock; save: jest.Mock };
  let roles: { findById: jest.Mock };
  let hasher: { compare: jest.Mock };
  let audit: { record: jest.Mock };

  const adminWith = (phone: string | null) =>
    new AdminUser('ad1', 'Ops', 'ops@store.com', phone, 'hash', 'role1', false, null, AdminUserStatus.ACTIVE, 0, null, null, new Date(), new Date(), null);

  beforeEach(async () => {
    admins = { findById: jest.fn(), save: jest.fn().mockImplementation((a) => Promise.resolve(a)) };
    roles = { findById: jest.fn() };
    hasher = { compare: jest.fn().mockResolvedValue(true) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateAdmin2faUseCase,
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
        { provide: ROLE_REPOSITORY, useValue: roles },
        { provide: PASSWORD_HASHER, useValue: hasher },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    useCase = module.get(UpdateAdmin2faUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('enables SMS 2FA when a phone is stored (FR-RBAC-008)', async () => {
    const admin = adminWith('+8801712345678');
    admins.findById.mockResolvedValue(admin);

    const result = await useCase.execute({ adminId: 'ad1', enabled: true, channel: TwofaChannel.SMS, currentPassword: 'p' });

    expect(admin.twofaEnabled).toBe(true);
    expect(result.channel).toBe(TwofaChannel.SMS);
  });

  it('rejects enabling SMS 2FA without a stored phone (400)', async () => {
    admins.findById.mockResolvedValue(adminWith(null));
    let thrown: unknown;
    try {
      await useCase.execute({ adminId: 'ad1', enabled: true, channel: TwofaChannel.SMS, currentPassword: 'p' });
    } catch (e) {
      thrown = e;
    }
    expect((thrown as HttpException).getStatus()).toBe(400);
  });

  it('rejects a wrong current password with 401', async () => {
    admins.findById.mockResolvedValue(adminWith('+8801712345678'));
    hasher.compare.mockResolvedValue(false);
    await expect(
      useCase.execute({ adminId: 'ad1', enabled: false, currentPassword: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lets a Super Admin disable their own 2FA — opt-in for every admin (FR-RBAC-008)', async () => {
    const admin = adminWith('+8801712345678');
    admin.twofaEnabled = true;
    admins.findById.mockResolvedValue(admin);
    roles.findById.mockResolvedValue(new Role('role1', SUPER_ADMIN_ROLE_NAME, null, true, new Date(), new Date(), null));

    const result = await useCase.execute({ adminId: 'ad1', enabled: false, currentPassword: 'p' });
    expect(result.twofaEnabled).toBe(false);
    expect(admin.twofaEnabled).toBe(false);
  });

  it('lets a non-super admin disable 2FA', async () => {
    const admin = adminWith('+8801712345678');
    admin.twofaEnabled = true;
    admins.findById.mockResolvedValue(admin);
    roles.findById.mockResolvedValue(new Role('role1', 'Order Manager', null, true, new Date(), new Date(), null));

    const result = await useCase.execute({ adminId: 'ad1', enabled: false, currentPassword: 'p' });
    expect(result.twofaEnabled).toBe(false);
  });
});
