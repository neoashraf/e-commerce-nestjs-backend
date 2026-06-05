import { GeoArea } from '../entities/geo-area.entity';
import { DeliveryZone } from '../enums/delivery-zone.enum';

/**
 * Persistence port for the GeoArea reference dataset (SRS 04 §5.6). The concrete TypeORM
 * implementation lives in infrastructure. Cascading reads (divisions → districts → areas)
 * return only `is_active` rows (AC2); resolution + override key on the full dataset.
 */
export interface IGeoAreaRepository {
  /** Distinct active division names, alphabetical (AC2). */
  listDivisions(): Promise<string[]>;

  /** Distinct active district names within a division, alphabetical (AC2). */
  listDistricts(division: string): Promise<string[]>;

  /** Active areas (upazilas/thanas) within a district, ordered by name (AC2). */
  listAreas(district: string): Promise<GeoArea[]>;

  /**
   * Resolve a (district, upazila) to its area row, or `null` when absent from the dataset —
   * the caller treats `null` as unserviceable rather than guessing a zone (FR-CART-046, AC3).
   */
  resolveArea(district: string, upazila: string): Promise<GeoArea | null>;

  findById(id: string): Promise<GeoArea | null>;

  /** Apply an admin zone override and return the updated area (FR-CART-047, AC4). */
  updateZone(id: string, zone: DeliveryZone): Promise<GeoArea>;
}

export const GEO_AREA_REPOSITORY = Symbol('IGeoAreaRepository');
