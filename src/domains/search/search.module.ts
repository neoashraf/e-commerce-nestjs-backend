import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AttributeOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { CategoryOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { CategoryFilterableAttributeOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/category-filterable-attribute.orm-entity';
import { ProductAttributeValueOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductCategoryOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-category.orm-entity';
import { ProductImageOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVariantOptionOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { ProductVariantOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductOrmEntity } from '../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { InventoryModule } from '../inventory/inventory.module';
import { RbacModule } from '../rbac/rbac.module';
import { INVENTORY_AVAILABILITY_PORT } from './application/ports/inventory-availability.port';
import { FacetCountService } from './application/services/facet-count.service';
import { FacetFilterService } from './application/services/facet-filter.service';
import { FacetResolverService } from './application/services/facet-resolver.service';
import { FacetService } from './application/services/facet.service';
import { ListingService } from './application/services/listing.service';
import { QueryLogService } from './application/services/query-log.service';
import { ReindexJobService } from './application/services/reindex-job.service';
import { SearchConfigService } from './application/services/search-config.service';
import { SearchIndexerService } from './application/services/search-indexer.service';
import { SearchService } from './application/services/search.service';
import { SuggestService } from './application/services/suggest.service';
import { InventoryAvailabilityAdapter } from './infrastructure/adapters/inventory-availability.adapter';
import { FacetDefinitionOrmEntity } from './infrastructure/persistence/typeorm/entities/facet-definition.orm-entity';
import { ProductSearchDocumentOrmEntity } from './infrastructure/persistence/typeorm/entities/product-search-document.orm-entity';
import { SearchQueryLogOrmEntity } from './infrastructure/persistence/typeorm/entities/search-query-log.orm-entity';
import { SearchRedirectOrmEntity } from './infrastructure/persistence/typeorm/entities/search-redirect.orm-entity';
import { SearchSynonymOrmEntity } from './infrastructure/persistence/typeorm/entities/search-synonym.orm-entity';
import { AdminFacetsController } from './presentation/controllers/admin-facets.controller';
import { AdminSearchConfigController } from './presentation/controllers/admin-search-config.controller';
import { AdminSearchIndexController } from './presentation/controllers/admin-search-index.controller';
import { ListingController } from './presentation/controllers/listing.controller';
import { SearchController } from './presentation/controllers/search.controller';

/**
 * Search & Browse domain (SRCH) — PostgreSQL FTS storefront discovery over a denormalized index
 * (`ProductSearchDocument`) projected from published CAT products + live INV availability. Owns the
 * three public reads (category browse, keyword search, autosuggest), synonyms/redirects storage + admin
 * CRUD, the reindex lifecycle, and search query logging/insights. Imports the CAT ORM entities it reads
 * (repositories only; truth stays in CAT), InventoryModule for the availability adapter, and RbacModule
 * for the admin auth/permission gate. The facet count layer is the facets sibling, built on this index.
 */
@Module({
  imports: [
    RbacModule,
    InventoryModule,
    TypeOrmModule.forFeature([
      ProductSearchDocumentOrmEntity,
      SearchSynonymOrmEntity,
      SearchRedirectOrmEntity,
      SearchQueryLogOrmEntity,
      FacetDefinitionOrmEntity,
      // CAT read-surface entities (repositories injected; SRCH never mutates them).
      ProductOrmEntity,
      CategoryOrmEntity,
      CategoryFilterableAttributeOrmEntity,
      ProductCategoryOrmEntity,
      ProductImageOrmEntity,
      ProductVariantOrmEntity,
      ProductVariantOptionOrmEntity,
      ProductAttributeValueOrmEntity,
      AttributeOrmEntity,
      AttributeOptionOrmEntity,
    ]),
  ],
  controllers: [
    ListingController,
    SearchController,
    AdminSearchConfigController,
    AdminSearchIndexController,
    AdminFacetsController,
  ],
  providers: [
    ListingService,
    SearchService,
    SuggestService,
    SearchConfigService,
    QueryLogService,
    SearchIndexerService,
    ReindexJobService,
    FacetResolverService,
    FacetFilterService,
    FacetCountService,
    FacetService,
    { provide: INVENTORY_AVAILABILITY_PORT, useClass: InventoryAvailabilityAdapter },
  ],
  // SearchIndexer is exported so CAT/INV reindex hooks can call it once wired (integration point).
  exports: [SearchIndexerService],
})
export class SearchModule {}
