import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';

import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import { ServiceTokenGuard } from '../../../../shared/guards/service-token.guard';
import {
  InitiateResult,
  PaymentsService,
  PaymentStatusView,
} from '../../application/services/payments.service';
import {
  InitiatePaymentDto,
  InitiateResultDto,
  PaymentStatusDto,
  RetryPaymentDto,
} from '../dto/payment.dto';

/**
 * Customer/internal payment lifecycle (FR-PAY-001–005, 044; contract: Initiation & Status). `initiate`
 * is the internal CART seam (service token) — one payment per (order, purpose); COD → `cod_pending`,
 * online → `initiated` + redirect. `retry` (customer) supersedes a prior failed/cancelled attempt;
 * `GET /payments/{id}` (customer) returns status. Gateway results (execute/IPN) are authoritative and
 * handled by pay-gateways-be — never finalized here.
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('initiate')
  @UseGuards(ServiceTokenGuard)
  @ApiSecurity('service-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate a payment for an order (internal, called by CART at placement)' })
  @ApiCreatedResponse({ type: InitiateResultDto })
  @ApiConflictResponse({ description: 'PAYMENT_ALREADY_EXISTS' })
  @ApiBadRequestResponse({ description: 'METHOD_DISABLED / ORDER_NOT_PENDING' })
  initiate(@Body() dto: InitiatePaymentDto): Promise<InitiateResult> {
    return this.payments.initiate({ order_id: dto.order_id, method: dto.method });
  }

  @Post('retry')
  @UseGuards(JwtCustomerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Retry payment for an order (supersedes a prior failed/cancelled attempt)' })
  @ApiCreatedResponse({ type: InitiateResultDto })
  @ApiConflictResponse({ description: 'PAYMENT_ALREADY_EXISTS' })
  @ApiBadRequestResponse({ description: 'METHOD_DISABLED / ORDER_NOT_PENDING' })
  retry(@Body() dto: RetryPaymentDto): Promise<InitiateResult> {
    return this.payments.retry(dto.order_id, dto.method);
  }

  @Get(':paymentId')
  @UseGuards(JwtCustomerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a payment status' })
  @ApiOkResponse({ type: PaymentStatusDto })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  getStatus(@Param('paymentId', ParseUUIDPipe) paymentId: string): Promise<PaymentStatusView> {
    return this.payments.getStatus(paymentId);
  }
}
