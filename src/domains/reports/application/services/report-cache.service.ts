import { Injectable } from '@nestjs/common';

/** A cached aggregate plus the "as of" instant it was computed (BR-RPT-7). */
export interface CachedAggregate<T> {
  value: T;
  /** ISO-8601 UTC instant the aggregate was computed. */
  asOf: string;
}

/**
 * Small in-memory aggregate cache (SRS 15 §4 "Aggregate Cache", BR-RPT-7). Reports may be served from a
 * cached summary; each result carries its `as_of` time so the UI can show data freshness and offer an
 * on-demand refresh (§12.7). TTL is short — reporting is near-real-time, not strictly live (§15). This is
 * deliberately process-local (no table): rpt-core persists no transactional/aggregate data; the export
 * and schedule tables belong to rpt-export-be.
 */
@Injectable()
export class ReportCacheService {
  private readonly store = new Map<string, CachedAggregate<unknown>>();
  private readonly ttlMs = 60_000;

  /** Return a fresh cached value, or compute it via `loader`, stamp `as_of`, cache, and return. */
  async getOrCompute<T>(key: string, loader: () => Promise<T>): Promise<CachedAggregate<T>> {
    const now = Date.now();
    const hit = this.store.get(key) as CachedAggregate<T> | undefined;
    if (hit && now - Date.parse(hit.asOf) < this.ttlMs) {
      return hit;
    }
    const value = await loader();
    const entry: CachedAggregate<T> = { value, asOf: new Date(now).toISOString() };
    this.store.set(key, entry);
    return entry;
  }

  /** Drop all cached aggregates (used by an on-demand refresh / tests). */
  clear(): void {
    this.store.clear();
  }
}
