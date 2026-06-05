import { Inject, Injectable } from '@nestjs/common';

import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';

/**
 * The outcome of resolving an address to a delivery zone. `serviceable: false` means the
 * (district, upazila) is absent from the seeded dataset — the caller must reject it as
 * unserviceable rather than guess a zone (FR-CART-046, AC3).
 */
export type ZoneResolution =
  | { serviceable: true; zone: DeliveryZone }
  | { serviceable: false; zone: null };

/**
 * Address → delivery-zone resolver (FR-CART-046, AC3). Exported from CartModule so AUTH address
 * create/edit (FR-AUTH-050/051) and checkout can resolve the zone for a given (district, upazila)
 * without reaching into CART's persistence. Deterministic: an area present in the dataset returns
 * its (possibly admin-overridden) zone; an absent area is unserviceable.
 */
@Injectable()
export class ZoneResolverService {
  constructor(
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
  ) {}

  async resolveZone(district: string, upazila: string): Promise<ZoneResolution> {
    const area = await this.geo.resolveArea(district, upazila);
    if (!area) {
      return { serviceable: false, zone: null };
    }
    return { serviceable: true, zone: area.deliveryZone };
  }
}
