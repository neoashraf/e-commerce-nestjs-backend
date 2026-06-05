import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Address } from '../../domain/entities/address.entity';
import { ADDRESS_REPOSITORY } from '../../domain/repositories/address.repository.interface';
import { DeleteAddressUseCase } from '../use-cases/delete-address.use-case';

function makeAddress(id: string, isDefault: boolean): Address {
  const now = new Date();
  return Address.create(
    id,
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
    isDefault,
    now,
  );
}

describe('Auth — DeleteAddressUseCase', () => {
  let useCase: DeleteAddressUseCase;
  let addresses: {
    findById: jest.Mock;
    findByCustomerId: jest.Mock;
    softDelete: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    addresses = {
      findById: jest.fn(),
      findByCustomerId: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation((a: Address) => Promise.resolve(a)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeleteAddressUseCase, { provide: ADDRESS_REPOSITORY, useValue: addresses }],
    }).compile();
    useCase = module.get(DeleteAddressUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('404s when the address belongs to another customer (AC4)', async () => {
    addresses.findById.mockResolvedValue(makeAddress('addr-1', true));

    await expect(
      useCase.execute({ customerId: 'someone-else', addressId: 'addr-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(addresses.softDelete).not.toHaveBeenCalled();
  });

  it('promotes the most-recently-used remaining address when the default is deleted (FR-AUTH-053)', async () => {
    addresses.findById.mockResolvedValue(makeAddress('addr-1', true));
    const remaining = makeAddress('addr-2', false);
    addresses.findByCustomerId.mockResolvedValue([remaining]);

    await useCase.execute({ customerId: 'cust-1', addressId: 'addr-1' });

    expect(addresses.softDelete).toHaveBeenCalledWith('addr-1');
    const promoted = addresses.save.mock.calls[0][0] as Address;
    expect(promoted.id).toBe('addr-2');
    expect(promoted.isDefault).toBe(true);
  });

  it('does not promote when a non-default address is deleted (FR-AUTH-053)', async () => {
    addresses.findById.mockResolvedValue(makeAddress('addr-1', false));

    await useCase.execute({ customerId: 'cust-1', addressId: 'addr-1' });

    expect(addresses.softDelete).toHaveBeenCalledWith('addr-1');
    expect(addresses.save).not.toHaveBeenCalled();
  });

  it('leaves no default when the last address is deleted (FR-AUTH-053)', async () => {
    addresses.findById.mockResolvedValue(makeAddress('addr-1', true));
    addresses.findByCustomerId.mockResolvedValue([]);

    await useCase.execute({ customerId: 'cust-1', addressId: 'addr-1' });

    expect(addresses.save).not.toHaveBeenCalled();
  });
});
