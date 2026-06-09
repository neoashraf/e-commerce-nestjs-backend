import { Injectable, Logger } from '@nestjs/common';

import { SearchIndexerService } from '../../../search/application/services/search-indexer.service';
import { ISearchIndexPort } from '../../application/ports/search-index.port';

/**
 * SRCH-index adapter for CAT publish hooks. Delegates to the search indexer (exported by SearchModule)
 * and DEGRADES GRACEFULLY — an index error is logged but never fails the catalog write, because the
 * reindex job (`POST /admin/search/reindex`) reconciles the full index (FR-SRCH-072).
 */
@Injectable()
export class SearchIndexAdapter implements ISearchIndexPort {
  private readonly logger = new Logger(SearchIndexAdapter.name);

  constructor(private readonly indexer: SearchIndexerService) {}

  async upsert(productId: string): Promise<void> {
    try {
      await this.indexer.upsert(productId);
    } catch (err) {
      this.logger.warn(
        `Search-index upsert failed for ${productId}; a reindex will reconcile: ${String(err)}`,
      );
    }
  }

  async remove(productId: string): Promise<void> {
    try {
      await this.indexer.remove(productId);
    } catch (err) {
      this.logger.warn(
        `Search-index remove failed for ${productId}; a reindex will reconcile: ${String(err)}`,
      );
    }
  }
}
