import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

import { SettingsService } from '../services/settings.service';
import { GatewayEnvironment, PaymentMethod } from '../../domain/payment-enums';
import { GatewayConfigOrmEntity } from '../../infrastructure/persistence/typeorm/entities/gateway-config.orm-entity';

describe('Payments — SettingsService', () => {
  let service: SettingsService;
  let configs: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    configs = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((c) => c),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getRepositoryToken(GatewayConfigOrmEntity), useValue: configs },
      ],
    }).compile();

    service = module.get(SettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should expose credentials_ref but never a raw secret in the view', async () => {
    configs.find.mockResolvedValue([
      { method: PaymentMethod.BKASH, environment: GatewayEnvironment.LIVE, credentialsRef: 'secret://pay/bkash', isEnabled: true },
    ]);
    const view = await service.getAll();
    expect(view[PaymentMethod.BKASH]).toEqual({
      environment: GatewayEnvironment.LIVE,
      credentials_ref: 'secret://pay/bkash',
      is_enabled: true,
    });
    // Confirm no raw secret key leaks into the response object.
    expect(JSON.stringify(view)).not.toContain('app_secret');
  });

  it('should default COD enabled when no config row exists', async () => {
    const view = await service.getAll();
    expect(view[PaymentMethod.COD].is_enabled).toBe(true);
    expect(view[PaymentMethod.BKASH].is_enabled).toBe(false);
  });

  it('should report a disabled method as not enabled (blocks initiation)', async () => {
    configs.findOne.mockResolvedValue({ method: PaymentMethod.BKASH, isEnabled: false });
    expect(await service.isMethodEnabled(PaymentMethod.BKASH)).toBe(false);
  });

  it('should upsert a method patch', async () => {
    await service.update({ [PaymentMethod.SSLCOMMERZ]: { is_enabled: true } });
    expect(configs.save).toHaveBeenCalledWith(expect.objectContaining({ isEnabled: true }));
  });
});
