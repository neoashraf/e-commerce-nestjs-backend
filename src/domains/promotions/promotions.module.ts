import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { RbacModule } from '../rbac/rbac.module';
import { CouponEngineService } from './application/services/coupon-engine.service';
import { CouponsService } from './application/services/coupons.service';
import {
  ORDER_HISTORY_READER,
  StubOrderHistoryReader,
} from './application/ports/order-history-reader.port';
import { CouponOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';
import { CouponEngineController } from './presentation/controllers/coupon-engine.controller';
import { CouponsController } from './presentation/controllers/coupons.controller';

/**
 * Promotions (PROMO) domain — coupon definitions + admin management + usage read (promo-coupons-be),
 * plus the validate/redeem/reverse engine (promo-engine-be) behind CART's `CouponValidator` port and
 * checkout redeem / ORD reversal. The engine enforces usage caps atomically and is idempotent per
 * order. `first_order_only` reads history via the `OrderHistoryReader` port (stubbed until AUTH/ORD
 * is wired). `CouponEngineService` is exported for in-process consumers (CART/ORD).
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([CouponOrmEntity, CouponRedemptionOrmEntity]),
  ],
  controllers: [CouponsController, CouponEngineController],
  providers: [
    CouponsService,
    CouponEngineService,
    ServiceTokenGuard,
    // AUTH/ORD seam: stub until order history is wired (first-order-only defaults to eligible).
    { provide: ORDER_HISTORY_READER, useClass: StubOrderHistoryReader },
  ],
  exports: [CouponsService, CouponEngineService],
})
export class PromotionsModule {}
