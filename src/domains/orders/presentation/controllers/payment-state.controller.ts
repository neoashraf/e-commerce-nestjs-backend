import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../../shared/guards/service-token.guard';
import { OrderCreationService } from '../../application/services/order-creation.service';
import { PaymentStateResultDto, ReflectPaymentStateDto } from '../dto/payment-state.dto';

/**
 * Internal order payment-state reflection (FR-ORD-010–013; contract: Internal). Called
 * service-to-service by PAY (the `OrderGateway` target) when a payment outcome lands. Guarded by the
 * shared service token. `paid` advances `pending_payment → confirmed` (triggering INV decrement +
 * NOTIF); failure keeps `pending_payment` for retry; COD transitions are mirrored. Idempotent.
 */
@ApiTags('Orders — Internal')
@ApiSecurity('service-token')
@UseGuards(ServiceTokenGuard)
@Controller('internal/orders')
export class PaymentStateController {
  constructor(private readonly creation: OrderCreationService) {}

  @Post(':orderNo/payment-state')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Reflect a payment outcome onto the order (paid → confirmed, idempotent)' })
  @ApiOkResponse({ type: PaymentStateResultDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  reflect(
    @Param('orderNo') orderNo: string,
    @Body() dto: ReflectPaymentStateDto,
  ): Promise<PaymentStateResultDto> {
    const at = dto.at ? new Date(dto.at) : new Date();
    return this.creation.reflectPaymentState(orderNo, dto.payment_state, at);
  }
}
