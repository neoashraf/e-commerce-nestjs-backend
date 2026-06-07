import { Test, TestingModule } from '@nestjs/testing';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { GEO_AREA_REPOSITORY } from '../../domain/repositories/geo-area.repository.interface';
import { ZoneResolverService } from '../services/zone-resolver.service';

const mockGeoRepo = () => ({
  listDivisions: jest.fn(),
  listDistricts: jest.fn(),
  listAreas: jest.fn(),
  resolveArea: jest.fn(),
  findById: jest.fn(),
  updateZone: jest.fn(),
});

const buildArea = (o: Partial<GeoArea> = {}): GeoArea =>
  new GeoArea(
    o.id ?? 'geo-1',
    o.division ?? 'Dhaka',
    o.district ?? 'Dhaka',
    o.upazila ?? 'Dhanmondi',
    o.deliveryZone ?? DeliveryZone.INSIDE_DHAKA,
    o.postalCode ?? '1209',
    o.isActive ?? true,
    new Date(),
    new Date(),
  );

describe('Cart — ZoneResolverService', () => {
  let service: ZoneResolverService;
  let geo: ReturnType<typeof mockGeoRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ZoneResolverService,
        { provide: GEO_AREA_REPOSITORY, useFactory: mockGeoRepo },
      ],
    }).compile();
    service = module.get(ZoneResolverService);
    geo = module.get(GEO_AREA_REPOSITORY);
  });

  afterEach(() => jest.clearAllMocks());

  it('should resolve to the area zone when (district, upazila) exists (FR-CART-046)', async () => {
    geo.resolveArea.mockResolvedValue(buildArea({ deliveryZone: DeliveryZone.INSIDE_DHAKA }));

    const result = await service.resolveZone('Dhaka', 'Dhanmondi');

    expect(geo.resolveArea).toHaveBeenCalledWith('Dhaka', 'Dhanmondi');
    expect(result).toEqual({ serviceable: true, zone: DeliveryZone.INSIDE_DHAKA });
  });

  it('should reflect an admin-overridden zone (FR-CART-047)', async () => {
    geo.resolveArea.mockResolvedValue(buildArea({ deliveryZone: DeliveryZone.NEAR_DHAKA }));

    const result = await service.resolveZone('Dhaka', 'Dhanmondi');

    expect(result).toEqual({ serviceable: true, zone: DeliveryZone.NEAR_DHAKA });
  });

  it('should return unserviceable when the area is absent — no guessing (FR-CART-046, AC3)', async () => {
    geo.resolveArea.mockResolvedValue(null);

    const result = await service.resolveZone('Atlantis', 'Nowhere');

    expect(result).toEqual({ serviceable: false, zone: null });
  });
});
