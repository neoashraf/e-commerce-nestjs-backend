import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import { ISearchReadModel, SearchQueryRow } from '../../application/ports/search-read.port';

/**
 * Read-only SRCH adapter for RPT. Groups the append-only `search_query_log` by `normalized_text` so
 * casing/spacing variants collapse, exposing the most-searched and most-frequent zero-result queries for
 * the period (merchandising signal, §7.2). The range filter is evaluated in Asia/Dhaka (BR-RPT-4).
 * Read-side only (BR-RPT-5); decoupled from SRCH ORM classes (table/column names only).
 */
@Injectable()
export class SearchReadAdapter implements ISearchReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Asia/Dhaka local-day predicate over the log's `created_at`. */
  private readonly rangePredicate = `(created_at AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date`;

  async getPopularQueries(range: ReportRange, topN: number): Promise<SearchQueryRow[]> {
    const rows: Array<{ query: string; occurrences: number; result_count: number }> =
      await this.dataSource.query(
        `SELECT MIN(query_text) AS query,
                COUNT(*)::int AS occurrences,
                COALESCE(MAX(result_count), 0)::int AS result_count
         FROM search_query_log
         WHERE ${this.rangePredicate}
         GROUP BY normalized_text
         ORDER BY occurrences DESC
         LIMIT $3`,
        [range.from, range.to, topN],
      );
    return rows.map((r) => ({
      query: r.query,
      occurrences: Number(r.occurrences),
      result_count: Number(r.result_count),
    }));
  }

  async getZeroResultQueries(range: ReportRange, topN: number): Promise<SearchQueryRow[]> {
    const rows: Array<{ query: string; occurrences: number }> = await this.dataSource.query(
      `SELECT MIN(query_text) AS query, COUNT(*)::int AS occurrences
       FROM search_query_log
       WHERE had_results = false AND ${this.rangePredicate}
       GROUP BY normalized_text
       ORDER BY occurrences DESC
       LIMIT $3`,
      [range.from, range.to, topN],
    );
    return rows.map((r) => ({
      query: r.query,
      occurrences: Number(r.occurrences),
      result_count: 0,
    }));
  }
}
