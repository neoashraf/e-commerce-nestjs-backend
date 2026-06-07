import {
  Body,
  Controller,
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
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { RefundsService } from '../../application/services/refunds.service';
import { RefundDto, RefundResultDto } from '../dto/refund.dto';

/**
 * Admin refunds (FR-PAY-050–052; contract: Refund). Gated by `payments.refund`. Refunds a prepaid
 * cancellation or duplicate capture of a paid online payment; rejected `409` for COD / non-paid /
 * post-delivery returns (exchange-only); `422` when cumulative refund exceeds the captured amount.
 */
@ApiTags('Payments — Refunds')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/payments')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post(':paymentId/refund')
  @Requires('payments.refund')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Refund a prepaid cancellation / duplicate capture (online only)' })
  @ApiCreatedResponse({ type: RefundResultDto })
  @ApiConflictResponse({ description: 'NOT_REFUNDABLE (COD / not paid / post-delivery return)' })
  @ApiUnprocessableEntityResponse({ description: 'REFUND_EXCEEDS_CAPTURED / INVALID_AMOUNT' })
  async refund(
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: RefundDto,
  ): Promise<RefundResultDto> {
    const result = await this.refunds.refund({
      paymentId,
      amount: dto.amount,
      reason: dto.reason,
      adminId: null,
    });
    return {
      refund_id: result.refund_id,
      type: result.type,
      status: result.status,
      payment_status: result.payment_status,
    };
  }
}
