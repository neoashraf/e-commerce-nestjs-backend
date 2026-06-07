import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import { FulfilmentService } from '../../application/services/fulfilment.service';
import { CancelOrderDto, CustomerCancelResultDto } from '../dto/fulfilment.dto';

/**
 * Customer self-service cancellation (FR-ORD-040, 042; contract: Customer). A customer may cancel
 * their own order while it is `pending_payment` or `confirmed` (pre-`processing`); the order is set
 * `cancelled`, stock is restocked, and a prepaid (`paid`) online order triggers a gateway refund.
 */
@ApiTags('Orders — Customer')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me/orders')
export class CustomerCancelController {
  constructor(private readonly fulfilment: FulfilmentService) {}

  @Post(':orderNo/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Cancel my own order (pre-dispatch)' })
  @ApiOkResponse({ type: CustomerCancelResultDto })
  @ApiConflictResponse({ description: 'NOT_CANCELLABLE' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  async cancel(
    @Param('orderNo') orderNo: string,
    @Body() dto: CancelOrderDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<CustomerCancelResultDto> {
    const result = await this.fulfilment.customerCancel(orderNo, customer.customerId, dto.reason);
    return { order_no: result.orderNo, status: result.status, refund: result.refund };
  }
}
