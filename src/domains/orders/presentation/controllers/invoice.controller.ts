import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { SkipEnvelope } from '../../../../shared/decorators/skip-envelope.decorator';
import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import {
  InvoiceFormat,
  InvoiceService,
  RenderedInvoice,
} from '../../application/services/invoice.service';
import { OrderTrackingService } from '../../application/services/order-tracking.service';

/**
 * Invoice generation (FR-ORD-073; contract: Customer + Admin invoice). Server-renders the order's invoice
 * as PDF (default) or HTML — seller details incl. VAT BIN, buyer/delivery, itemized lines, the amount
 * breakdown with the informational inclusive-15% VAT line, payment method/state, order no/date; Mushak-6.3
 * compatible. The customer route is own-order-only; the admin route is gated by `orders.order.read`. The
 * raw file body bypasses the `{ data }` envelope (`@SkipEnvelope`).
 */
@ApiTags('Orders — Invoice')
@Controller()
export class InvoiceController {
  constructor(
    private readonly tracking: OrderTrackingService,
    private readonly invoices: InvoiceService,
  ) {}

  @Get('me/orders/:orderNo/invoice')
  @SkipEnvelope()
  @UseGuards(JwtCustomerGuard)
  @ApiBearerAuth()
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'html'], required: false })
  @ApiProduces('application/pdf', 'text/html')
  @ApiOperation({ summary: 'Download my order invoice (PDF/HTML)' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  async customerInvoice(
    @Param('orderNo') orderNo: string,
    @Query('format') format: string | undefined,
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Res() res: Response,
  ): Promise<void> {
    const aggregate = await this.tracking.loadOwnOrder(customer.customerId, orderNo);
    const rendered = await this.invoices.render(aggregate, this.parseFormat(format));
    this.send(res, rendered);
  }

  @Get('admin/orders/:orderNo/invoice')
  @SkipEnvelope()
  @UseGuards(JwtAdminGuard, PermissionsGuard)
  @Requires('orders.order.read')
  @ApiBearerAuth()
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiQuery({ name: 'format', enum: ['pdf', 'html'], required: false })
  @ApiProduces('application/pdf', 'text/html')
  @ApiOperation({ summary: 'Download an order invoice (admin) (PDF/HTML)' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND' })
  async adminInvoice(
    @Param('orderNo') orderNo: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const aggregate = await this.tracking.loadOrder(orderNo);
    const rendered = await this.invoices.render(aggregate, this.parseFormat(format));
    this.send(res, rendered);
  }

  private parseFormat(format: string | undefined): InvoiceFormat {
    return format?.toLowerCase() === 'html' ? 'html' : 'pdf';
  }

  private send(res: Response, rendered: RenderedInvoice): void {
    res.setHeader('Content-Type', rendered.contentType);
    // `attachment` so the invoice routes download as a file rather than rendering
    // inline — both the customer and admin endpoints are "Download" operations.
    res.setHeader('Content-Disposition', `attachment; filename="${rendered.filename}"`);
    res.send(rendered.buffer);
  }
}
