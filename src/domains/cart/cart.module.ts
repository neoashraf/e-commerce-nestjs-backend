import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RbacModule } from '../rbac/rbac.module';
import { CartService } from './application/cart/cart.service';
import { CATALOG_READER, CatalogVariantReader } from './application/ports/catalog-reader.port';
import { InventoryStockChecker, STOCK_CHECKER } from './application/ports/stock-checker.port';
import { GEO_AREA_REPOSITORY } from './domain/repositories/geo-area.repository.interface';
import { ListAreasUseCase } from './application/use-cases/list-areas.use-case';
import { ListDistrictsUseCase } from './application/use-cases/list-districts.use-case';
import { ListDivisionsUseCase } from './application/use-cases/list-divisions.use-case';
import { OverrideAreaZoneUseCase } from './application/use-cases/override-area-zone.use-case';
import { ZoneResolverService } from './application/services/zone-resolver.service';
import { CartItemOrmEntity } from './infrastructure/persistence/typeorm/entities/cart-item.orm-entity';
import { CartOrmEntity } from './infrastructure/persistence/typeorm/entities/cart.orm-entity';
import { GeoAreaOrmEntity } from './infrastructure/persistence/typeorm/entities/geo-area.orm-entity';
import { TypeOrmGeoAreaRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-geo-area.repository';
import { CartController } from './presentation/controllers/cart.controller';
import { GeoController } from './presentation/controllers/geo.controller';
import { AdminGeoController } from './presentation/controllers/admin-geo.controller';

/**
 * Cart domain (CART). The BD geography reference (GeoArea) + zone resolver (cart-delivery-zone-be) and
 * the cart core (cart-core-be): the Cart/CartItem aggregate with add/view/update/remove/clear + guest→
 * customer merge. Prices read live from CAT via the `CatalogReader` port; stock re-checked live via the
 * `StockChecker` port (INV) — the cart never stores price/stock (BR-CART-1). Imports CatalogModule (read
 * seam) + InventoryModule (stock seam) + AuthModule (optional customer guard) + RbacModule (admin geo).
 */
@Module({
  imports: [
    RbacModule,
    AuthModule,
    CatalogModule,
    InventoryModule,
    TypeOrmModule.forFeature([GeoAreaOrmEntity, CartOrmEntity, CartItemOrmEntity]),
  ],
  controllers: [GeoController, AdminGeoController, CartController],
  providers: [
    { provide: GEO_AREA_REPOSITORY, useClass: TypeOrmGeoAreaRepository },
    ListDivisionsUseCase,
    ListDistrictsUseCase,
    ListAreasUseCase,
    OverrideAreaZoneUseCase,
    ZoneResolverService,
    CartService,
    { provide: CATALOG_READER, useClass: CatalogVariantReader },
    { provide: STOCK_CHECKER, useClass: InventoryStockChecker },
  ],
  exports: [ZoneResolverService, GEO_AREA_REPOSITORY, CartService],
})
export class CartModule {}
