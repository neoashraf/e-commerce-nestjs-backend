import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../../shared/guards/service-token.guard';
import {
  CouponEngineService,
  RedeemResult,
  ReverseResult,
  ValidateResult,
} from '../../application/services/coupon-engine.service';
import {
  RedeemCouponDto,
  RedeemResultDto,
  ReverseCouponDto,
  ReverseResultDto,
  ValidateCouponDto,
  ValidateResultDto,
} from '../dto/engine.dto';

/**
 * Internal coupon engine (PROMO §5.2/§5.3; contract: Validation & Redemption). Called
 * service-to-service by CART (validate at apply + placement) and ORD (reverse on cancel);
 * guarded by the shared service token, not a customer/admin JWT. `validate` returns a verdict +
 * Decimal discount or a specific reason; `redeem` enforces caps atomically + is idempotent per
 * order; `reverse` frees a use idempotently (exchanges never call it).
 */
@ApiTags('Promotions — Internal Engine')
@ApiSecurity('service-token')
@UseGuards(ServiceTokenGuard)
@Controller('internal/coupons')
export class CouponEngineController {
  constructor(private readonly engine: CouponEngineService) {}

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a coupon against a cart (verdict + discount, or a reason)' })
  @ApiOkResponse({ type: ValidateResultDto })
  validate(@Body() dto: ValidateCouponDto): Promise<ValidateResult> {
    return this.engine.validate({
      code: dto.code,
      identity: dto.identity,
      cart: { lines: dto.cart.lines, subtotal: dto.cart.subtotal },
    });
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Redeem a coupon at placement (atomic caps; idempotent per order)' })
  @ApiOkResponse({ type: RedeemResultDto })
  @ApiConflictResponse({
    description: 'USAGE_LIMIT_REACHED / PER_CUSTOMER_LIMIT_REACHED / COUPON_INVALID{reason}',
  })
  redeem(@Body() dto: RedeemCouponDto): Promise<RedeemResult> {
    return this.engine.redeem({
      code: dto.code,
      order_id: dto.order_id,
      identity: dto.identity,
      discount_amount: dto.discount_amount,
    });
  }

  @Post('reverse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reverse a redemption on order cancellation (idempotent)' })
  @ApiOkResponse({ type: ReverseResultDto })
  reverse(@Body() dto: ReverseCouponDto): Promise<ReverseResult> {
    return this.engine.reverse(dto.order_id);
  }
}
