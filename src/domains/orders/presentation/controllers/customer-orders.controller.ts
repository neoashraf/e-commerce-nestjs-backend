import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
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
import { Paginated } from '../../../../shared/dto/paginated';
import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import { OrderTrackingService } from '../../application/services/order-tracking.service';
import {
  OrderDetailDto,
  OrderHistoryQueryDto,
  OrderSummaryDto,
} from '../dto/tracking.dto';

/**
 * Customer order history + detail (FR-ORD-060, 071; contract: Customer — History & Detail). A customer
 * reads only their own orders: a paginated newest-first list and the full snapshot detail (items, amounts,
 * address, shipment, status history). A non-owned/unknown order returns a generic `404`.
 */
@ApiTags('Orders — Customer')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me/orders')
export class CustomerOrdersController {
  constructor(private readonly tracking: OrderTrackingService) {}

  @Get()
  @ApiOperation({ summary: 'List my orders (newest first)' })
  @ApiOkResponse({ type: [OrderSummaryDto] })
  getHistory(
    @Query() query: OrderHistoryQueryDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<Paginated<OrderSummaryDto>> {
    return this.tracking.getCustomerHistory(customer.customerId, query.page, query.limit);
  }

  @Get(':orderNo')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Get one of my orders in full detail' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  getDetail(
    @Param('orderNo') orderNo: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<OrderDetailDto> {
    return this.tracking.getCustomerOrderDetail(customer.customerId, orderNo);
  }
}
