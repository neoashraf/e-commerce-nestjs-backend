import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Address } from '../../domain/entities/address.entity';
import { ADDRESS_REPOSITORY } from '../../domain/repositories/address.repository.interface';
import { ZONE_RESOLVER } from '../ports/zone-resolver.port';
import { UpdateAddressUseCase } from '../use-cases/update-address.use-case';

function makeAddress(overrides: Partial<Address> = {}): Address {
  const now = new Date();
  const a = Address.create(
    'addr-1',
    'cust-1',
    {
      recipientName: 'Sabbir Ahmed',
      recipientPhone: '+8801712345678',
      addressLine: 'House 12',
      area: 'Dhanmondi',
      district: 'Dhaka',
      division: 'Dhaka',
      postalCode: '1209',
      deliveryZone: 'inside_dhaka',
    },
    false,
    now,
  );
  Object.assign(a, overrides);
  return a;
}

describe('Auth — UpdateAddressUseCase', () => {
  let useCase: UpdateAddressUseCase;
  let addresses: {
    findById: jest.Mock;
    clearDefault: jest.Mock;
    save: jest.Mock;
  };
  let zoneResolver: { resolveZone: jest.Mock };

  beforeEach(async () => {
    addresses = {
      findById: jest.fn().mockResolvedValue(makeAddress()),
      clearDefault: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((a: Address) => Promise.resolve(a)),
    };
    zoneResolver = {
      resolveZone: jest.fn().mockResolvedValue({ serviceable: true, zone: 'near_dhaka' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateAddressUseCase,
        { provide: ADDRESS_REPOSITORY, useValue: addresses },
        { provide: ZONE_RESOLVER, useValue: zoneResolver },
      ],
    }).compile();
    useCase = module.get(UpdateAddressUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('404s when the address belongs to another customer (AC4)', async () => {
    addresses.findById.mockResolvedValue(makeAddress({ customerId: 'someone-else' }));

    await expect(
      useCase.execute({ customerId: 'cust-1', addressId: 'addr-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('re-resolves the zone when the area changes (FR-AUTH-051)', async () => {
    const result = await useCase.execute({
      customerId: 'cust-1',
      addressId: 'addr-1',
      area: 'Savar',
    });

    expect(zoneResolver.resolveZone).toHaveBeenCalledWith('Dhaka', 'Savar');
    expect(result.deliveryZone).toBe('near_dhaka');
  });

  it('does not re-resolve the zone when only the recipient changes', async () => {
    await useCase.execute({
      customerId: 'cust-1',
      addressId: 'addr-1',
      recipientName: 'New Name',
    });

    expect(zoneResolver.resolveZone).not.toHaveBeenCalled();
  });

  it('rejects an unserviceable area on update with 400', async () => {
    zoneResolver.resolveZone.mockResolvedValue({ serviceable: false, zone: null });

    await expect(
      useCase.execute({ customerId: 'cust-1', addressId: 'addr-1', district: 'Atlantis' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('promotes to default and clears the prior default (FR-AUTH-052)', async () => {
    const result = await useCase.execute({
      customerId: 'cust-1',
      addressId: 'addr-1',
      isDefault: true,
    });

    expect(addresses.clearDefault).toHaveBeenCalledWith('cust-1');
    expect(result.isDefault).toBe(true);
  });

  it('does not clear defaults when the address is already the default', async () => {
    addresses.findById.mockResolvedValue(makeAddress({ isDefault: true }));

    await useCase.execute({ customerId: 'cust-1', addressId: 'addr-1', isDefault: true });

    expect(addresses.clearDefault).not.toHaveBeenCalled();
  });
});
