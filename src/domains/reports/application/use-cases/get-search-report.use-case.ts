import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { SearchView } from '../../domain/report-views';
import {
  ISearchReadModel,
  SEARCH_READ_MODEL,
  SearchQueryRow,
} from '../ports/search-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/**
 * Search insights (FR-RPT-060): the period's most-popular or most-frequent zero-result queries, to guide
 * merchandising (§7.2). Reads SRCH through the port and serves from the aggregate cache (BR-RPT-7).
 */
@Injectable()
export class GetSearchReportUseCase {
  constructor(
    @Inject(SEARCH_READ_MODEL) private readonly search: ISearchReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(
    period: ReportPeriod,
    view: SearchView,
    topN: number,
  ): Promise<SearchQueryRow[]> {
    const range = { from: period.from, to: period.to };
    const key = `search:${view}:${topN}:${period.from}:${period.to}`;
    const cached = await this.cache.getOrCompute(key, () =>
      view === SearchView.ZERO_RESULTS
        ? this.search.getZeroResultQueries(range, topN)
        : this.search.getPopularQueries(range, topN),
    );
    return cached.value;
  }
}
