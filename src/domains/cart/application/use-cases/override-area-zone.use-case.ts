import { Inject, Injectable } from '@nestjs/common';

import { GeoArea } from '../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import {
  GEO_AREA_REPOSITORY,
  IGeoAreaRepository,
} from '../../domain/repositories/geo-area.repository.interface';

/**
 * Admin reclassification of an area's delivery zone (FR-CART-047, AC4). The override persists
 * immediately, so later resolution (FR-CART-046) reflects it on the next lookup.
 */
@Injectable()
export class OverrideAreaZoneUseCase {
  constructor(
    @Inject(GEO_AREA_REPOSITORY) private readonly geo: IGeoAreaRepository,
  ) {}

  execute(id: string, zone: DeliveryZone): Promise<GeoArea> {
    return this.geo.updateZone(id, zone);
  }
}
