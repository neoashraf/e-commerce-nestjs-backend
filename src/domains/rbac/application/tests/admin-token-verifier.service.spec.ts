import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';

import { AdminUserStatus } from '../../domain/enums/admin-user-status.enum';
import { ADMIN_USER_REPOSITORY } from '../../domain/repositories/admin-user.repository.interface';
import { AdminTokenVerifierService } from '../services/admin-token-verifier.service';

describe('RBAC — AdminTokenVerifierService', () => {
  let service: AdminTokenVerifierService;
  let jwt: { verifyAsync: jest.Mock };
  let admins: { findById: jest.Mock };

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn() };
    admins = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTokenVerifierService,
        { provide: JwtService, useValue: jwt },
        { provide: ADMIN_USER_REPOSITORY, useValue: admins },
      ],
    }).compile();
    service = module.get(AdminTokenVerifierService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns null for a missing token without touching the JWT', async () => {
    await expect(service.verify(undefined)).resolves.toBeNull();
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('returns null for an unverifiable/expired token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    await expect(service.verify('bad')).resolves.toBeNull();
  });

  it('returns null for a non-admin-audience token (does not hit the repo)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'c1', aud: 'customer' });
    await expect(service.verify('t')).resolves.toBeNull();
    expect(admins.findById).not.toHaveBeenCalled();
  });

  it('returns null when the admin is missing or not active (suspend takes effect immediately)', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'a1', aud: 'admin' });
    admins.findById.mockResolvedValue({ id: 'a1', roleId: 'r1', status: AdminUserStatus.SUSPENDED });
    await expect(service.verify('t')).resolves.toBeNull();
  });

  it('returns the verified admin for an active admin token', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'a1', aud: 'admin' });
    admins.findById.mockResolvedValue({ id: 'a1', roleId: 'r1', status: AdminUserStatus.ACTIVE });
    await expect(service.verify('t')).resolves.toEqual({ adminId: 'a1', roleId: 'r1' });
  });
});
