import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Address } from '../../domain/entities/address.entity';
import { ADDRESS_REPOSITORY } from '../../domain/repositories/address.repository.interface';
import { ZONE_RESOLVER } from '../ports/zone-resolver.port';
import { CreateAddressUseCase } from '../use-cases/create-address.use-case';

const baseCmd = {
  customerId: 'cust-1',
  recipientName: 'Sabbir Ahmed',
  recipientPhone: '01712345678',
  addressLine: 'House 12, Road 5, Dhanmondi',
  area: 'Dhanmondi',
  district: 'Dhaka',
  division: 'Dhaka',
};

describe('Auth — CreateAddressUseCase', () => {
  let useCase: CreateAddressUseCase;
  let addresses: {
    findByCustomerId: jest.Mock;
    clearDefault: jest.Mock;
    save: jest.Mock;
  };
  let zoneResolver: { resolveZone: jest.Mock };

  beforeEach(async () => {
    addresses = {
      findByCustomerId: jest.fn().mockResolvedValue([]),
      clearDefault: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((a: Address) => Promise.resolve(a)),
    };
    zoneResolver = {
      resolveZone: jest.fn().mockResolvedValue({ serviceable: true, zone: 'inside_dhaka' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateAddressUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
        { provide: ZONE_RESOLVER, useValue: zoneResolver },
      ],
    }).compile();
    useCase = module.get(CreateAddressUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('resolves and stores the delivery zone, normalizes the recipient phone (FR-AUTH-050/051)', async () => {
    await useCase.execute(baseCmd);

    expect(zoneResolver.resolveZone).toHaveBeenCalledWith('Dhaka', 'Dhanmondi');
    const saved = addresses.save.mock.calls[0][0] as Address;
    expect(saved.deliveryZone).toBe('inside_dhaka');
    expect(saved.recipientPhone).toBe('+8801712345678');
  });

  it('auto-defaults the first-ever address (FR-AUTH-052)', async () => {
    const result = await useCase.execute(baseCmd);

    const saved = addresses.save.mock.calls[0][0] as Address;
    expect(saved.isDefault).toBe(true);
    expect(result.isDefault).toBe(true);
  });

  it('clears the prior default when is_default is requested (FR-AUTH-052/BR-AUTH-6)', async () => {
    addresses.findByCustomerId.mockResolvedValue([{ id: 'addr-existing' } as Address]);

    await useCase.execute({ ...baseCmd, isDefault: true });

    expect(addresses.clearDefault).toHaveBeenCalledWith('cust-1');
    const saved = addresses.save.mock.calls[0][0] as Address;
    expect(saved.isDefault).toBe(true);
  });

  it('does not default a subsequent address unless asked (FR-AUTH-052)', async () => {
    addresses.findByCustomerId.mockResolvedValue([{ id: 'addr-existing' } as Address]);

    await useCase.execute(baseCmd);

    expect(addresses.clearDefault).not.toHaveBeenCalled();
    const saved = addresses.save.mock.calls[0][0] as Address;
    expect(saved.isDefault).toBe(false);
  });

  it('rejects an unserviceable area with 400 (AC1)', async () => {
    zoneResolver.resolveZone.mockResolvedValue({ serviceable: false, zone: null });

    await expect(useCase.execute(baseCmd)).rejects.toBeInstanceOf(BadRequestException);
    expect(addresses.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid BD recipient phone with 400', async () => {
    await expect(
      useCase.execute({ ...baseCmd, recipientPhone: '+15551234567' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a missing geo field with 400 (AC1)', async () => {
    await expect(useCase.execute({ ...baseCmd, district: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-4-digit postal code with 400', async () => {
    await expect(useCase.execute({ ...baseCmd, postalCode: '12' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
