import { ReportRange } from './orders-read.port';

/** One search-insights row (FR-RPT-060). */
export interface SearchQueryRow {
  /** Representative query text for the normalised group. */
  query: string;
  /** Number of times the query was searched in the period. */
  occurrences: number;
  /** Result count for the query (0 for the zero-results view). */
  result_count: number;
}

/**
 * Read-only view RPT takes over SRCH (query logs). Queries are grouped by their normalised form so casing/
 * spacing variants collapse together; `popular` ranks by occurrence, `zero_results` lists queries that
 * returned nothing (merchandising signal, §7.2). Read-side only (BR-RPT-5); decoupled from SRCH ORM
 * classes — implemented over the `search_query_log` table.
 */
export interface ISearchReadModel {
  /** Most-searched queries in the period, capped at `topN` (FR-RPT-060). */
  getPopularQueries(range: ReportRange, topN: number): Promise<SearchQueryRow[]>;

  /** Most-frequent zero-result queries in the period, capped at `topN` (FR-RPT-060). */
  getZeroResultQueries(range: ReportRange, topN: number): Promise<SearchQueryRow[]>;
}

export const SEARCH_READ_MODEL = Symbol('ISearchReadModel');
