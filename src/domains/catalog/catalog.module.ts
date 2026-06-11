import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SearchModule } from '../search/search.module';
import { ATTRIBUTE_REPOSITORY } from './domain/repositories/attribute.repository.interface';
import { ATTRIBUTE_FAMILY_REPOSITORY } from './domain/repositories/attribute-family.repository.interface';
import { CATEGORY_REPOSITORY } from './domain/repositories/category.repository.interface';
import { AttributeAssignmentValidator } from './application/services/attribute-assignment.validator';
import { CategorySupportService } from './application/services/category-support.service';
import { FamilyGroupingValidator } from './application/services/family-grouping.validator';
import { CreateAttributeUseCase } from './application/use-cases/create-attribute.use-case';
import { DeleteAttributeUseCase } from './application/use-cases/delete-attribute.use-case';
import { GetAttributeUseCase } from './application/use-cases/get-attribute.use-case';
import { ListAttributesUseCase } from './application/use-cases/list-attributes.use-case';
import { UpdateAttributeUseCase } from './application/use-cases/update-attribute.use-case';
import { CreateAttributeFamilyUseCase } from './application/use-cases/create-attribute-family.use-case';
import { DeleteAttributeFamilyUseCase } from './application/use-cases/delete-attribute-family.use-case';
import { GetAttributeFamilyUseCase } from './application/use-cases/get-attribute-family.use-case';
import { ListAttributeFamiliesUseCase } from './application/use-cases/list-attribute-families.use-case';
import { UpdateAttributeFamilyUseCase } from './application/use-cases/update-attribute-family.use-case';
import { CreateCategoryUseCase } from './application/use-cases/create-category.use-case';
import { DeleteCategoryUseCase } from './application/use-cases/delete-category.use-case';
import { GetAdminCategoryTreeUseCase } from './application/use-cases/get-admin-category-tree.use-case';
import { GetCategoryUseCase } from './application/use-cases/get-category.use-case';
import { GetPublicCategoryTreeUseCase } from './application/use-cases/get-public-category-tree.use-case';
import { UpdateCategoryUseCase } from './application/use-cases/update-category.use-case';
import { AttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { AttributeFamilyOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import { AttributeGroupOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-group.orm-entity';
import { FamilyAttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/family-attribute.orm-entity';
import { CategoryOrmEntity } from './infrastructure/persistence/typeorm/entities/category.orm-entity';
import { CategoryFilterableAttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/category-filterable-attribute.orm-entity';
import { ProductOrmEntity } from './infrastructure/persistence/typeorm/entities/product.orm-entity';
import { ProductAttributeValueOrmEntity } from './infrastructure/persistence/typeorm/entities/product-attribute-value.orm-entity';
import { ProductCategoryOrmEntity } from './infrastructure/persistence/typeorm/entities/product-category.orm-entity';
import { ProductImageOrmEntity } from './infrastructure/persistence/typeorm/entities/product-image.orm-entity';
import { ProductVideoOrmEntity } from './infrastructure/persistence/typeorm/entities/product-video.orm-entity';
import { ProductLinkOrmEntity } from './infrastructure/persistence/typeorm/entities/product-link.orm-entity';
import { ProductConfigurableAttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/product-configurable-attribute.orm-entity';
import { ProductVariantOrmEntity } from './infrastructure/persistence/typeorm/entities/product-variant.orm-entity';
import { ProductVariantOptionOrmEntity } from './infrastructure/persistence/typeorm/entities/product-variant-option.orm-entity';
import { TypeOrmAttributeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-attribute.repository';
import { TypeOrmAttributeFamilyRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-attribute-family.repository';
import { TypeOrmCategoryRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-category.repository';
import { AttributesController } from './presentation/controllers/attributes.controller';
import { AttributeFamiliesController } from './presentation/controllers/attribute-families.controller';
import { CategoriesController } from './presentation/controllers/categories.controller';
import { CategoriesPublicController } from './presentation/controllers/categories-public.controller';
import { ProductsController } from './presentation/controllers/products.controller';
import { ProductMediaController } from './presentation/controllers/product-media.controller';
import { VariantsController } from './presentation/controllers/variants.controller';
import { ProductDetailController } from './presentation/controllers/product-detail.controller';
import { ProductsService } from './application/services/products.service';
import { ProductSupportService } from './application/services/product-support.service';
import { ProductMediaService } from './application/services/product-media.service';
import { ProductPublishValidator } from './application/services/product-publish.validator';
import { VariantsService } from './application/services/variants.service';
import { ProductDetailService } from './application/services/product-detail.service';
import { INVENTORY_QTY_PORT } from './application/ports/inventory-qty.port';
import { PRODUCT_VARIANT_PUBLISH_PORT } from './application/ports/product-variant-publish.port';
import { INVENTORY_STATUS_PORT } from './application/ports/inventory-status.port';
import { INVENTORY_ADMIN_PORT } from './application/ports/inventory-admin.port';
import { SEARCH_INDEX_PORT } from './application/ports/search-index.port';
import { InventoryQtyAdapter } from './infrastructure/adapters/inventory-qty.adapter';
import { VariantPublishAdapter } from './infrastructure/adapters/variant-publish.adapter';
import { InventoryStatusAdapter } from './infrastructure/adapters/inventory-status.adapter';
import { InventoryAdminAdapter } from './infrastructure/adapters/inventory-admin.adapter';
import { SearchIndexAdapter } from './infrastructure/adapters/search-index.adapter';

/**
 * Catalog domain (CAT). Slices so far: the attribute system (Attribute + AttributeOption) and
 * its admin CRUD (SRS 02 §5.2), attribute families/groups (AttributeFamily + AttributeGroup
 * + FamilyAttribute) with their admin CRUD (SRS 02 §5.3), and the category tree (Category +
 * CategoryFilterableAttribute) with admin CRUD + the public tree (SRS 02 §5.1/§5.7). Imports
 * RbacModule for the admin auth + permission gate. `AttributeAssignmentValidator` and the
 * category repository are exported for later product/variant briefs.
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => SearchModule),
    TypeOrmModule.forFeature([
      AttributeOrmEntity,
      AttributeOptionOrmEntity,
      AttributeFamilyOrmEntity,
      AttributeGroupOrmEntity,
      FamilyAttributeOrmEntity,
      CategoryOrmEntity,
      CategoryFilterableAttributeOrmEntity,
      ProductOrmEntity,
      ProductAttributeValueOrmEntity,
      ProductCategoryOrmEntity,
      ProductImageOrmEntity,
      ProductVideoOrmEntity,
      ProductLinkOrmEntity,
      ProductConfigurableAttributeOrmEntity,
      ProductVariantOrmEntity,
      ProductVariantOptionOrmEntity,
    ]),
  ],
  controllers: [
    AttributesController,
    AttributeFamiliesController,
    CategoriesController,
    CategoriesPublicController,
    ProductsController,
    ProductMediaController,
    VariantsController,
    ProductDetailController,
  ],
  providers: [
    { provide: ATTRIBUTE_REPOSITORY, useClass: TypeOrmAttributeRepository },
    { provide: ATTRIBUTE_FAMILY_REPOSITORY, useClass: TypeOrmAttributeFamilyRepository },
    { provide: CATEGORY_REPOSITORY, useClass: TypeOrmCategoryRepository },
    ListAttributesUseCase,
    GetAttributeUseCase,
    CreateAttributeUseCase,
    UpdateAttributeUseCase,
    DeleteAttributeUseCase,
    AttributeAssignmentValidator,
    FamilyGroupingValidator,
    ListAttributeFamiliesUseCase,
    GetAttributeFamilyUseCase,
    CreateAttributeFamilyUseCase,
    UpdateAttributeFamilyUseCase,
    DeleteAttributeFamilyUseCase,
    CategorySupportService,
    CreateCategoryUseCase,
    UpdateCategoryUseCase,
    DeleteCategoryUseCase,
    GetAdminCategoryTreeUseCase,
    GetCategoryUseCase,
    GetPublicCategoryTreeUseCase,
    ProductsService,
    ProductSupportService,
    ProductMediaService,
    ProductPublishValidator,
    VariantsService,
    ProductDetailService,
    { provide: INVENTORY_QTY_PORT, useClass: InventoryQtyAdapter },
    { provide: PRODUCT_VARIANT_PUBLISH_PORT, useClass: VariantPublishAdapter },
    { provide: SEARCH_INDEX_PORT, useClass: SearchIndexAdapter },
    { provide: INVENTORY_STATUS_PORT, useClass: InventoryStatusAdapter },
    { provide: INVENTORY_ADMIN_PORT, useClass: InventoryAdminAdapter },
  ],
  exports: [
    AttributeAssignmentValidator,
    ATTRIBUTE_REPOSITORY,
    ATTRIBUTE_FAMILY_REPOSITORY,
    CATEGORY_REPOSITORY,
    ProductsService,
    ProductSupportService,
    VariantsService,
    ProductDetailService,
  ],
})
export class CatalogModule {}
