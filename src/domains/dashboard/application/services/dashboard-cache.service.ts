import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FullDashboardSummary } from '../../domain/summary.types';

interface CacheEntry {
  summary: FullDashboardSummary;
  computedAt: number;
}

/**
 * Short-lived in-memory cache for computed dashboard aggregates (FR-DASH-031, BR-DASH-6, §14).
 * Keyed by the period signature; serves entries within the staleness window (default 5 min,
 * `DASH_CACHE_TTL_MS`). The cached summary carries an `as_of`; `refresh` invalidates + recomputes
 * (FR-DASH-032). Single-process cache — a distributed cache (Redis) is a later integration point.
 */
@Injectable()
export class DashboardCacheService {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(config: ConfigService) {
    this.ttlMs = Number(config.get<string>('DASH_CACHE_TTL_MS', '300000'));
  }

  /** Fresh cached summary for a period key, or `null` when absent/stale. */
  get(key: string, now: Date = new Date()): FullDashboardSummary | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (now.getTime() - entry.computedAt > this.ttlMs) return null;
    return entry.summary;
  }

  set(key: string, summary: FullDashboardSummary, now: Date = new Date()): void {
    this.store.set(key, { summary, computedAt: now.getTime() });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}
