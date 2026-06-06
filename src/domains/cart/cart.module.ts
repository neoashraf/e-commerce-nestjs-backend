import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { RbacModule } from '../rbac/rbac.module';
import { CartService } from './application/cart/cart.service';
import { CheckoutService } from './application/checkout/checkout.service';
import { DeliverySettingsService } from './application/checkout/delivery-settings.service';
import { SummaryService } from './application/checkout/summary.service';
import {
  COUPON_VALIDATOR,
  ORDER_PLACER,
  PAYMENT_INITIATOR,
  STOCK_RESERVER,
  InventoryStockReserver,
  OrdersOrderPlacer,
  PaymentsPaymentInitiator,
  PromoCouponValidator,
} from './application/checkout/checkout.ports';
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
import { CheckoutSessionOrmEntity } from './infrastructure/persistence/typeorm/entities/checkout-session.orm-entity';
import { DeliveryZoneChargeOrmEntity } from './infrastructure/persistence/typeorm/entities/delivery-zone-charge.orm-entity';
import { GeoAreaOrmEntity } from './infrastructure/persistence/typeorm/entities/geo-area.orm-entity';
import { TypeOrmGeoAreaRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-geo-area.repository';
import { AdminDeliverySettingsController } from './presentation/controllers/admin-delivery-settings.controller';
import { CartController } from './presentation/controllers/cart.controller';
import { CheckoutController } from './presentation/controllers/checkout.controller';
import { GeoController } from './presentation/controllers/geo.controller';
import { AdminGeoController } from './presentation/controllers/admin-geo.controller';

/**
 * Cart domain (CART). Geography/zone resolver (cart-delivery-zone-be) + cart core (cart-core-be) +
 * checkout orchestration (checkout-be): quote (zone + summary + COD availability) and place (re-validate
 * lines/coupon → reserve stock → create order → initiate payment → clear cart, idempotent per key). The
 * BW5 integration step — every cross-module call goes through a port wired to the **real** impl: INV
 * (ReservationService), ORD (OrderCreationService), PAY (PaymentsService), PROMO (CouponEngineService),
 * AUTH (lightweight account for guests). Also owns DeliveryZoneCharge settings (deferred here by
 * cart-delivery-zone-be) with the BD defaults. `CartService` exported for in-process use.
 */
@Module({
  imports: [
    forwardRef(() => RbacModule),
    forwardRef(() => AuthModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => OrdersModule),
    forwardRef(() => PaymentsModule),
    forwardRef(() => PromotionsModule),
    TypeOrmModule.forFeature([
      GeoAreaOrmEntity,
      CartOrmEntity,
      CartItemOrmEntity,
      CheckoutSessionOrmEntity,
      DeliveryZoneChargeOrmEntity,
    ]),
  ],
  controllers: [
    GeoController,
    AdminGeoController,
    CartController,
    CheckoutController,
    AdminDeliverySettingsController,
  ],
  providers: [
    { provide: GEO_AREA_REPOSITORY, useClass: TypeOrmGeoAreaRepository },
    ListDivisionsUseCase,
    ListDistrictsUseCase,
    ListAreasUseCase,
    OverrideAreaZoneUseCase,
    ZoneResolverService,
    CartService,
    CheckoutService,
    DeliverySettingsService,
    SummaryService,
    { provide: CATALOG_READER, useClass: CatalogVariantReader },
    { provide: STOCK_CHECKER, useClass: InventoryStockChecker },
    // Checkout cross-module ports → real impls (BW5 integration).
    { provide: STOCK_RESERVER, useClass: InventoryStockReserver },
    { provide: ORDER_PLACER, useClass: OrdersOrderPlacer },
    { provide: PAYMENT_INITIATOR, useClass: PaymentsPaymentInitiator },
    { provide: COUPON_VALIDATOR, useClass: PromoCouponValidator },
  ],
  exports: [ZoneResolverService, GEO_AREA_REPOSITORY, CartService],
})
export class CartModule {}
