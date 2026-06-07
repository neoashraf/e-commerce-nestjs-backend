import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../../shared/guards/service-token.guard';
import { ExchangeDifferenceService } from '../../application/services/exchange-difference.service';
import { PaymentMethod } from '../../domain/payment-enums';
import { ExchangeDifferenceDto } from '../dto/refund.dto';
import { InitiateResultDto } from '../dto/payment.dto';

/**
 * Internal exchange price-difference capture (FR-PAY-053; contract: exchange-difference). Called
 * service-to-service by ORD when a higher-value replacement needs a top-up. Guarded by the service
 * token. Creates a separate `exchange_difference` payment that must reach `paid` before ORD issues the
 * replacement; `400` if the amount ≤ 0.
 */
@ApiTags('Payments — Internal')
@ApiSecurity('service-token')
@UseGuards(ServiceTokenGuard)
@Controller('payments')
export class ExchangeDifferenceController {
  constructor(private readonly exchangeDifference: ExchangeDifferenceService) {}

  @Post('exchange-difference')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate an exchange price-difference capture (internal, called by ORD)' })
  @ApiCreatedResponse({ type: InitiateResultDto })
  @ApiBadRequestResponse({ description: 'INVALID_AMOUNT' })
  initiate(@Body() dto: ExchangeDifferenceDto): Promise<InitiateResultDto> {
    return this.exchangeDifference.initiate({
      order_id: dto.order_id,
      exchange_id: dto.exchange_id,
      amount: dto.amount,
      method: dto.method as PaymentMethod,
    });
  }
}
