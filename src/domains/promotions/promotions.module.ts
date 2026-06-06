import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { CouponsService } from './application/services/coupons.service';
import { CouponOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon.orm-entity';
import { CouponRedemptionOrmEntity } from './infrastructure/persistence/typeorm/entities/coupon-redemption.orm-entity';
import { CouponsController } from './presentation/controllers/coupons.controller';

/**
 * Promotions (PROMO) domain — the first PROMO backend slice: coupon definitions + admin management +
 * usage read. Imports RbacModule for the admin auth/permission gate. The validate/redeem/reverse engine
 * (promo-engine-be) builds on the exported `CouponsService` + the Coupon/CouponRedemption entities.
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([CouponOrmEntity, CouponRedemptionOrmEntity]),
  ],
  controllers: [CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class PromotionsModule {}
