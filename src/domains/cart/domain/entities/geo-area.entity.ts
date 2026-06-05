import { DeliveryZone } from '../enums/delivery-zone.enum';

/**
 * A row of the seeded Bangladesh administrative-geography reference dataset (SRS 04 §5.6, §8
 * GeoArea): one (division → district → upazila/thana) tuple carrying the `deliveryZone` it
 * resolves to. Pure domain entity — no ORM/Nest imports. The zone is seeded by the Appendix-A
 * rule (FR-CART-044/045) and is admin-overridable (FR-CART-047). Address forms (AUTH) select
 * division→district→upazila from these rows, and zone resolution (FR-CART-046) keys on
 * (district, upazila).
 */
export class GeoArea {
  constructor(
    public readonly id: string,
    public division: string,
    public district: string,
    public upazila: string,
    public deliveryZone: DeliveryZone,
    public postalCode: string | null,
    public isActive: boolean,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {}

  /** Reclassify this area's delivery zone (admin override, FR-CART-047). */
  overrideZone(zone: DeliveryZone): void {
    this.deliveryZone = zone;
  }
}
