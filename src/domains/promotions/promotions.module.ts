import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { RbacModule } from '../rbac/rbac.module';
import { CouponEngineService } from './application/services/coupon-engine.service';
import { CouponsService } from './application/services/coupons.service';
import { ORDER_HISTORY_READER } from './application/ports/order-history-reader.port';
import { OrderOrmEntity } from '../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrdOrderHistoryReader } from './infrastructure/adapters/ord-order-history.reader';
import { CouponOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';
import { CouponEngineController } from './presentation/controllers/coupon-engine.controller';
import { CouponsController } from './presentation/controllers/coupons.controller';

/**
 * Promotions (PROMO) domain — coupon definitions + admin management + usage read (promo-coupons-be),
 * plus the validate/redeem/reverse engine (promo-engine-be) behind CART's `CouponValidator` port and
 * checkout redeem / ORD reversal. The engine enforces usage caps atomically and is idempotent per
 * order. `first_order_only` reads ORD order history via the `OrderHistoryReader` port.
 * `CouponEngineService` is exported for in-process consumers (CART/ORD).
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      CouponOrmEntity,
      CouponRedemptionOrmEntity,
      OrderOrmEntity, // read-only: first-order-only reads ORD order history (FR-PROMO-007)
    ]),
  ],
  controllers: [CouponsController, CouponEngineController],
  providers: [
    CouponsService,
    CouponEngineService,
    ServiceTokenGuard,
    { provide: ORDER_HISTORY_READER, useClass: OrdOrderHistoryReader },
  ],
  exports: [CouponsService, CouponEngineService],
})
export class PromotionsModule {}
