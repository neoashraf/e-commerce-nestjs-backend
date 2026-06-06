import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CATALOG_READER, CatalogWishlistReader } from './application/ports/catalog-reader.port';
import { CART_ADDER, CartItemAdder } from './application/ports/cart-adder.port';
import { InventoryStockChecker, STOCK_CHECKER } from './application/ports/stock-checker.port';
import { WishlistService } from './application/wishlist.service';
import { WishlistItemOrmEntity } from './infrastructure/persistence/typeorm/entities/wishlist-item.orm-entity';
import { WishlistOrmEntity } from './infrastructure/persistence/typeorm/entities/wishlist.orm-entity';
import { WishlistController } from './presentation/controllers/wishlist.controller';

/**
 * Wishlist domain (WISH, SRS 07). A single server-persisted wishlist per customer with add/remove/clear,
 * a live view (price/availability read from CAT/INV at view time, BR-WISH-2), move-to-cart, batch
 * membership, and guest-merge. Cross-module reads/writes go through ports wired to the real impls:
 * CAT (`ProductDetailService`), INV (`InventoryService`), CART (`CartService`); AUTH supplies the
 * customer guard. Commerce modules are circular → imported via `forwardRef()`.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => CartModule),
    TypeOrmModule.forFeature([WishlistOrmEntity, WishlistItemOrmEntity]),
  ],
  controllers: [WishlistController],
  providers: [
    WishlistService,
    { provide: CATALOG_READER, useClass: CatalogWishlistReader },
    { provide: STOCK_CHECKER, useClass: InventoryStockChecker },
    { provide: CART_ADDER, useClass: CartItemAdder },
  ],
  exports: [WishlistService],
})
export class WishlistModule {}
