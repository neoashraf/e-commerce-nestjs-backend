import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { Paginated } from '../../../../shared/dto/paginated';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { FulfilmentService } from '../../application/services/fulfilment.service';
import { OrderTrackingService } from '../../application/services/order-tracking.service';
import {
  AdminOrderRowDto,
  ListAdminOrdersQueryDto,
} from '../dto/admin-orders.dto';
import {
  AddOrderNoteDto,
  AddOrderNoteResultDto,
  AdminCancelResultDto,
  CancelOrderDto,
  UpdateOrderStatusDto,
  UpdateOrderStatusResultDto,
} from '../dto/fulfilment.dto';
import { OrderDetailDto } from '../dto/tracking.dto';

/**
 * Admin fulfilment management (FR-ORD-020–024, 041, 072; contract: Admin — Management). Advance an
 * order forward through the lifecycle + record shipment, cancel a pre-`shipped` order (restock +
 * prepaid refund trigger), and add internal notes. Gated by `orders.order.*` permissions.
 */
@ApiTags('Orders — Admin Management')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/orders')
export class FulfilmentController {
  constructor(
    private readonly fulfilment: FulfilmentService,
    private readonly tracking: OrderTrackingService,
  ) {}

  @Get()
  @Requires('orders.order.read')
  @ApiOperation({ summary: 'List / search orders (status, payment_state, q, phone, date range)' })
  @ApiOkResponse({ type: AdminOrderRowDto, isArray: true })
  list(@Query() query: ListAdminOrdersQueryDto): Promise<Paginated<AdminOrderRowDto>> {
    return this.tracking.listAdminOrders({
      status: query.status,
      paymentState: query.payment_state,
      q: query.q,
      phone: query.phone,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get(':orderNo')
  @Requires('orders.order.read')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Get full order detail (snapshot, items, amounts, shipment, history)' })
  @ApiOkResponse({ type: OrderDetailDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  async detail(@Param('orderNo') orderNo: string): Promise<OrderDetailDto> {
    const aggregate = await this.tracking.loadOrder(orderNo);
    return this.tracking.toDetail(aggregate);
  }

  @Patch(':orderNo/status')
  @Requires('orders.order.update_status')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Advance fulfilment status / record shipment (forward-only)' })
  @ApiOkResponse({ type: UpdateOrderStatusResultDto })
  @ApiConflictResponse({ description: 'INVALID_TRANSITION | PAYMENT_REQUIRED' })
  @ApiBadRequestResponse({ description: 'Missing courier_name/tracking_number entering shipped' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  updateStatus(
    @Param('orderNo') orderNo: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<UpdateOrderStatusResultDto> {
    return this.fulfilment.advanceStatus(orderNo, {
      toStatus: dto.to_status,
      courierName: dto.courier_name,
      trackingNumber: dto.tracking_number,
      note: dto.note,
      actorId: admin.adminId,
    });
  }

  @Post(':orderNo/cancel')
  @HttpCode(HttpStatus.OK)
  @Requires('orders.order.cancel')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Cancel a pre-shipped order (restock + prepaid refund trigger)' })
  @ApiOkResponse({ type: AdminCancelResultDto })
  @ApiConflictResponse({ description: 'NOT_CANCELLABLE' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  cancel(
    @Param('orderNo') orderNo: string,
    @Body() dto: CancelOrderDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<AdminCancelResultDto> {
    return this.fulfilment.adminCancel(orderNo, admin.adminId, dto.reason);
  }

  @Post(':orderNo/notes')
  @HttpCode(HttpStatus.CREATED)
  @Requires('orders.order.update_status')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Add an internal note (not customer-visible)' })
  @ApiCreatedResponse({ type: AddOrderNoteResultDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  addNote(
    @Param('orderNo') orderNo: string,
    @Body() dto: AddOrderNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<AddOrderNoteResultDto> {
    return this.fulfilment.addNote(orderNo, dto.body, admin.adminId);
  }
}
