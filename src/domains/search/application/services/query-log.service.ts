import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import { InsightsType } from '../../domain/search-enums';
import { SearchQueryLogOrmEntity } from '../../infrastructure/persistence/typeorm/entities/search-query-log.orm-entity';

export interface InsightRow {
  normalized_text: string;
  result_count: number;
  occurrences: number;
}

export interface InsightsFilter {
  type: InsightsType;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

/**
 * Search query logging + operational insights (FR-SRCH-014). Every submitted search writes one
 * append-only `search_query_log` row (popular/zero-result feed for RPT). `insights` aggregates by
 * normalized query for the admin operational view (full reporting lives in RPT).
 */
@Injectable()
export class QueryLogService {
  constructor(
    @InjectRepository(SearchQueryLogOrmEntity)
    private readonly logs: Repository<SearchQueryLogOrmEntity>,
  ) {}

  /** Record one submitted search (FR-SRCH-014). Never throws into the query path on failure. */
  async log(input: {
    queryText: string;
    normalizedText: string;
    resultCount: number;
    customerId?: string | null;
  }): Promise<void> {
    await this.logs.save(
      this.logs.create({
        queryText: input.queryText.slice(0, 255),
        normalizedText: input.normalizedText.slice(0, 255),
        resultCount: input.resultCount,
        hadResults: input.resultCount > 0,
        customerId: input.customerId ?? null,
      }),
    );
  }

  /** Popular or zero-result aggregation by normalized query (contract: GET /admin/search/insights). */
  async insights(filter: InsightsFilter): Promise<Paginated<InsightRow>> {
    const qb = this.logs
      .createQueryBuilder('log')
      .select('log.normalized_text', 'normalized_text')
      .addSelect('MIN(log.result_count)', 'result_count')
      .addSelect('COUNT(*)', 'occurrences')
      .groupBy('log.normalized_text');

    if (filter.type === InsightsType.ZERO_RESULTS) {
      qb.andWhere('log.had_results = false');
    } else {
      qb.andWhere('log.had_results = true');
    }
    if (filter.from) qb.andWhere('log.created_at >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('log.created_at <= :to', { to: filter.to });

    const totalRows = await qb.clone().getRawMany();
    const total = totalRows.length;

    const raw = await qb
      .orderBy('occurrences', 'DESC')
      .addOrderBy('log.normalized_text', 'ASC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .getRawMany<{ normalized_text: string; result_count: string; occurrences: string }>();

    const items: InsightRow[] = raw.map((r) => ({
      normalized_text: r.normalized_text,
      result_count: Number(r.result_count),
      occurrences: Number(r.occurrences),
    }));
    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
  }
}
