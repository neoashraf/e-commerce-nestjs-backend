import { Injectable } from '@nestjs/common';

import { ZoneResolverService } from '../../../cart/application/services/zone-resolver.service';
import { ZoneResolution, ZoneResolverPort } from '../../application/ports/zone-resolver.port';

/**
 * Adapter binding AUTH's {@link ZoneResolverPort} to CART's exported `ZoneResolverService`
 * (FR-AUTH-051). Keeps the AUTH use-cases free of CART's `DeliveryZone` type — the port speaks the
 * zone as a plain string.
 */
@Injectable()
export class CartZoneResolverAdapter implements ZoneResolverPort {
  constructor(private readonly zoneResolver: ZoneResolverService) {}

  async resolveZone(district: string, area: string): Promise<ZoneResolution> {
    const result = await this.zoneResolver.resolveZone(district, area);
    return { serviceable: result.serviceable, zone: result.zone };
  }
}
