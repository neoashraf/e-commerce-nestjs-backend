import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
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
import { ExchangeService } from '../../application/services/exchange.service';
import {
  ConfirmReplacementDto,
  ConfirmReplacementResultDto,
  ExchangeStatusDto,
  RequestExchangeDto,
  RequestExchangeResultDto,
  UploadAttachmentResultDto,
} from '../dto/exchange.dto';

/** A multipart upload as exposed by multer (subset used here). */
interface UploadedEvidenceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Customer exchange surface (FR-ORD-045/048; contract: Customer). Request a post-delivery exchange for a
 * delivered item (eligibility-gated, evidence required for defects), upload evidence, check status, and
 * choose an equal/higher-value replacement (paying any difference). No cash refund (BR-ORD-8).
 */
@ApiTags('Orders — Exchanges (Customer)')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me')
export class ExchangeController {
  constructor(private readonly exchanges: ExchangeService) {}

  @Post('orders/:orderNo/exchanges')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiOperation({ summary: 'Request an exchange for a delivered item (post-delivery, no cash refund)' })
  @ApiCreatedResponse({ type: RequestExchangeResultDto, description: '202 Accepted — request received.' })
  @ApiConflictResponse({ description: 'EXCHANGE_INELIGIBLE { reason }' })
  @ApiBadRequestResponse({ description: 'quality_defect without evidence attachments' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND | ORDER_ITEM_NOT_FOUND' })
  requestExchange(
    @Param('orderNo') orderNo: string,
    @Body() dto: RequestExchangeDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<RequestExchangeResultDto> {
    return this.exchanges.requestExchange(orderNo, customer.customerId, {
      orderItemId: dto.order_item_id,
      reason: dto.reason,
      customerNote: dto.customer_note,
      attachmentIds: dto.attachment_ids,
    });
  }

  @Post('exchanges/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload exchange evidence (image/video)' })
  @ApiCreatedResponse({ type: UploadAttachmentResultDto })
  @ApiBadRequestResponse({ description: 'Missing file' })
  uploadAttachment(
    @UploadedFile() file: UploadedEvidenceFile | undefined,
  ): Promise<UploadAttachmentResultDto> {
    return this.exchanges.uploadAttachment(file);
  }

  @Get('orders/:orderNo/exchanges/:exchangeId')
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiParam({ name: 'exchangeId', example: 'ex_1' })
  @ApiOperation({ summary: 'Get the status of my exchange request' })
  @ApiOkResponse({ type: ExchangeStatusDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND | EXCHANGE_NOT_FOUND' })
  getStatus(
    @Param('orderNo') orderNo: string,
    @Param('exchangeId') exchangeId: string,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<ExchangeStatusDto> {
    return this.exchanges.getCustomerStatus(orderNo, customer.customerId, exchangeId);
  }

  @Post('orders/:orderNo/exchanges/:exchangeId/replacement')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'orderNo', example: 'SO-100245' })
  @ApiParam({ name: 'exchangeId', example: 'ex_1' })
  @ApiOperation({ summary: 'Confirm a replacement choice (pay any difference before issuance)' })
  @ApiOkResponse({ type: ConfirmReplacementResultDto })
  @ApiConflictResponse({ description: 'EXCHANGE_NOT_APPROVED | REPLACEMENT_LOWER_VALUE | REPLACEMENT_OUT_OF_STOCK' })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND | EXCHANGE_NOT_FOUND | VARIANT_NOT_FOUND' })
  confirmReplacement(
    @Param('orderNo') orderNo: string,
    @Param('exchangeId') exchangeId: string,
    @Body() dto: ConfirmReplacementDto,
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<ConfirmReplacementResultDto> {
    return this.exchanges.confirmReplacement(
      orderNo,
      customer.customerId,
      exchangeId,
      dto.replacement_variant_id,
    );
  }
}
