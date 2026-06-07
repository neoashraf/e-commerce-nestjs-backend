import { Test, TestingModule } from '@nestjs/testing';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { GEO_AREA_REPOSITORY } from '../../domain/repositories/geo-area.repository.interface';
import { OverrideAreaZoneUseCase } from '../use-cases/override-area-zone.use-case';

const mockGeoRepo = () => ({
  listDivisions: jest.fn(),
  listDistricts: jest.fn(),
  listAreas: jest.fn(),
  resolveArea: jest.fn(),
  findById: jest.fn(),
  updateZone: jest.fn(),
});

describe('Cart — OverrideAreaZoneUseCase', () => {
  let useCase: OverrideAreaZoneUseCase;
  let geo: ReturnType<typeof mockGeoRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverrideAreaZoneUseCase,
        { provide: GEO_AREA_REPOSITORY, useFactory: mockGeoRepo },
      ],
    }).compile();
    useCase = module.get(OverrideAreaZoneUseCase);
    geo = module.get(GEO_AREA_REPOSITORY);
  });

  afterEach(() => jest.clearAllMocks());

  it('should persist the new zone for the area (FR-CART-047, AC4)', async () => {
    const updated = new GeoArea(
      'geo-9', 'Dhaka', 'Dhaka', 'Demra', DeliveryZone.NEAR_DHAKA, null, true, new Date(), new Date(),
    );
    geo.updateZone.mockResolvedValue(updated);

    const result = await useCase.execute('geo-9', DeliveryZone.NEAR_DHAKA);

    expect(geo.updateZone).toHaveBeenCalledWith('geo-9', DeliveryZone.NEAR_DHAKA);
    expect(result.deliveryZone).toBe(DeliveryZone.NEAR_DHAKA);
  });
});
