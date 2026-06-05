/**
 * Port over CART's address → delivery-zone resolver (FR-AUTH-051, FR-CART-046). AUTH resolves the
 * zone for a (district, area/upazila) rather than implementing geo logic; an area absent from the
 * seeded dataset is unserviceable and the caller rejects the address with `400`.
 */
export interface ZoneResolution {
  serviceable: boolean;
  zone: string | null;
}

export interface ZoneResolverPort {
  resolveZone(district: string, area: string): Promise<ZoneResolution>;
}

export const ZONE_RESOLVER = Symbol('ZoneResolverPort');
