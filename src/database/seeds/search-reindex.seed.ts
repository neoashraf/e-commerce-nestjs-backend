import 'dotenv/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import { SearchIndexerService } from '../../domains/search/application/services/search-indexer.service';

/**
 * Rebuilds the storefront search index (`product_search_document`) from the current catalog.
 *
 * The storefront search / category-listing / suggest endpoints read ONLY from this denormalized
 * mirror, not from `products` directly — so newly seeded products stay invisible until they are
 * projected here. This boots a Nest application context and runs the real `SearchIndexerService.
 * reindexAll()`, which projects every PUBLISHED product in a PUBLISHED category (with correct
 * search_text, price, availability, colors/sizes, attribute facets). Run after the catalog/demo seeds.
 * Run: `npm run seed:search`
 */
async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const indexer = app.get(SearchIndexerService, { strict: false });
    const count = await indexer.reindexAll();
    console.log(`Search reindex complete: ${count} product document(s) indexed.`);
  } finally {
    await app.close();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Search reindex failed:', err);
    process.exit(1);
  });
