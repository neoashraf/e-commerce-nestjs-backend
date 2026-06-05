/**
 * The three delivery zones (SRS 04 §4, §8 GeoArea/DeliveryZoneCharge). A shopper's address
 * resolves to one of these via its (district, upazila); the zone drives the delivery charge and
 * COD surcharge. Owned by CART (the cross-cutting `DeliveryZone`, SRS 00 §6).
 */
export enum DeliveryZone {
  INSIDE_DHAKA = 'inside_dhaka',
  NEAR_DHAKA = 'near_dhaka',
  OUTSIDE_DHAKA = 'outside_dhaka',
}

export const DELIVERY_ZONES: DeliveryZone[] = [
  DeliveryZone.INSIDE_DHAKA,
  DeliveryZone.NEAR_DHAKA,
  DeliveryZone.OUTSIDE_DHAKA,
];
