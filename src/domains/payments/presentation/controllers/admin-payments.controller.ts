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
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { CodService } from '../../application/services/cod.service';
import { PaymentsService, PaymentStatusView } from '../../application/services/payments.service';
import { ReconService } from '../../application/services/recon.service';
import { CodCollectedDto, CodFailedDto, PaymentStatusDto } from '../dto/payment.dto';

/**
 * Admin payment operations (FR-PAY-010–012, 043; contract: Admin — COD, Reconciliation). COD
 * collected/failed are gated by `payments.cod.collect`; the reconciliation log read by
 * `payments.log.read`. Refunds + exchange-difference live in pay-refunds-be.
 */
@ApiTags('Payments — Admin')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly cod: CodService,
    private readonly recon: ReconService,
    private readonly payments: PaymentsService,
  ) {}

  @Get(':paymentId')
  @Requires('orders.order.read')
  @ApiOperation({
    summary: "Payment status for an order's payment panel (method, status, amount, refunded)",
  })
  @ApiOkResponse({ type: PaymentStatusDto })
  @ApiNotFoundResponse({ description: 'PAYMENT_NOT_FOUND' })
  getStatus(@Param('paymentId', ParseUUIDPipe) paymentId: string): Promise<PaymentStatusView> {
    return this.payments.getStatus(paymentId);
  }

  @Post(':paymentId/cod-collected')
  @Requires('payments.cod.collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a COD payment collected (records amount, admin, time)' })
  @ApiOkResponse({ description: '{ payment_id, status: cod_collected, collected_at }' })
  @ApiConflictResponse({ description: 'NOT_COD_PENDING' })
  codCollected(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: CodCollectedDto,
  ) {
    // collected_by_admin id is read from the admin token in a full impl; null until that seam is wired.
    return this.cod.markCollected(paymentId, dto.collected_amount, null);
  }

  @Post(':paymentId/cod-failed')
  @Requires('payments.cod.collect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a COD payment failed (refusal) — enables order cancellation' })
  @ApiOkResponse({ description: '{ payment_id, status: failed }' })
  @ApiConflictResponse({ description: 'NOT_COD_PENDING' })
  codFailed(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: CodFailedDto,
  ) {
    return this.cod.markFailed(paymentId, dto.reason);
  }

  @Get(':paymentId/log')
  @Requires('payments.log.read')
  @ApiOperation({ summary: 'Reconciliation log for a payment (append-only, chronological)' })
  @ApiOkResponse({ description: 'List of reconciliation events' })
  log(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.recon.listForPayment(paymentId);
  }
}
