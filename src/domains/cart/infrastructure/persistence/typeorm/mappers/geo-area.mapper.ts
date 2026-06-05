import { GeoArea } from '../../../../domain/entities/geo-area.entity';
import { DeliveryZone } from '../../../../domain/enums/delivery-zone.enum';
import { GeoAreaOrmEntity } from '../entities/geo-area.orm-entity';

/** ORM ⇄ domain mapping for GeoArea (ORM is never leaked past the repository). */
export class GeoAreaMapper {
  static toDomain(o: GeoAreaOrmEntity): GeoArea {
    return new GeoArea(
      o.id,
      o.division,
      o.district,
      o.upazila,
      o.deliveryZone as DeliveryZone,
      o.postalCode ?? null,
      o.isActive,
      o.createdAt,
      o.updatedAt,
    );
  }
}
