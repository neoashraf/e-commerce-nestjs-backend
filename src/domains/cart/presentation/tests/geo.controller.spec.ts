import { Test, TestingModule } from '@nestjs/testing';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { ListAreasUseCase } from '../../application/use-cases/list-areas.use-case';
import { ListDistrictsUseCase } from '../../application/use-cases/list-districts.use-case';
import { ListDivisionsUseCase } from '../../application/use-cases/list-divisions.use-case';
import { GeoController } from '../controllers/geo.controller';

describe('Cart — GeoController', () => {
  let controller: GeoController;
  let listDivisions: { execute: jest.Mock };
  let listDistricts: { execute: jest.Mock };
  let listAreas: { execute: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeoController],
      providers: [
        { provide: ListDivisionsUseCase, useFactory: () => ({ execute: jest.fn() }) },
        { provide: ListDistrictsUseCase, useFactory: () => ({ execute: jest.fn() }) },
        { provide: ListAreasUseCase, useFactory: () => ({ execute: jest.fn() }) },
      ],
    }).compile();
    controller = module.get(GeoController);
    listDivisions = module.get(ListDivisionsUseCase);
    listDistricts = module.get(ListDistrictsUseCase);
    listAreas = module.get(ListAreasUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return the division list (AC2)', async () => {
    listDivisions.execute.mockResolvedValue(['Barishal', 'Dhaka']);
    expect(await controller.divisions()).toEqual(['Barishal', 'Dhaka']);
  });

  it('should pass the division through to list districts (AC2)', async () => {
    listDistricts.execute.mockResolvedValue(['Dhaka', 'Gazipur']);
    const result = await controller.districts({ division: 'Dhaka' });
    expect(listDistricts.execute).toHaveBeenCalledWith('Dhaka');
    expect(result).toEqual(['Dhaka', 'Gazipur']);
  });

  it('should map areas to the snake_case response shape (AC2/AC5)', async () => {
    const area = new GeoArea(
      'geo-1', 'Dhaka', 'Dhaka', 'Dhanmondi', DeliveryZone.INSIDE_DHAKA, '1209', true, new Date(), new Date(),
    );
    listAreas.execute.mockResolvedValue([area]);

    const result = await controller.areas({ district: 'Dhaka' });

    expect(listAreas.execute).toHaveBeenCalledWith('Dhaka');
    expect(result).toEqual([
      {
        id: 'geo-1',
        division: 'Dhaka',
        district: 'Dhaka',
        upazila: 'Dhanmondi',
        delivery_zone: DeliveryZone.INSIDE_DHAKA,
        postal_code: '1209',
      },
    ]);
  });
});
