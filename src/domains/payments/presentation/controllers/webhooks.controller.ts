import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { SkipEnvelope } from '../../../../shared/decorators/skip-envelope.decorator';
import { WebhookService } from '../../application/services/webhook.service';
import {
  BkashCallbackDto,
  SslcommerzIpnDto,
  SslcommerzReturnDto,
} from '../dto/webhook.dto';

/**
 * Public, authenticity-verified gateway webhooks (FR-PAY-040–042; contract: Gateway Callbacks & IPN).
 * bKash callback → server-side execute → finalize → redirect (advisory). SSLCommerz IPN → validate via
 * the Order Validation API → finalize → **always 200** to stop retries. success/fail/cancel returns are
 * advisory redirects only. All raw bodies/redirects bypass the `{ data }` envelope via @SkipEnvelope().
 * No JWT — verified by gateway signature/validation, not a customer/admin token.
 */
@ApiTags('Payments — Webhooks')
@Controller('webhooks/payments')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get('bkash/callback')
  @SkipEnvelope()
  @ApiOperation({ summary: 'bKash auth callback → execute (authoritative) → redirect to result' })
  async bkashCallbackGet(@Query() query: BkashCallbackDto, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.webhooks.handleBkashCallback(query.paymentID, query.status);
    res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @Post('bkash/callback')
  @SkipEnvelope()
  @ApiExcludeEndpoint()
  async bkashCallbackPost(@Body() body: BkashCallbackDto, @Res() res: Response): Promise<void> {
    const { redirectUrl } = await this.webhooks.handleBkashCallback(body.paymentID, body.status);
    res.redirect(HttpStatus.FOUND, redirectUrl);
  }

  @Post('sslcommerz/ipn')
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @ApiOperation({ summary: 'SSLCommerz IPN → validate → finalize (always 200 { received: true })' })
  async sslcommerzIpn(@Body() body: SslcommerzIpnDto): Promise<{ received: true }> {
    return this.webhooks.handleSslcommerzIpn(body);
  }

  @Post('sslcommerz/success')
  @SkipEnvelope()
  @ApiOperation({ summary: 'SSLCommerz success return (advisory redirect only)' })
  sslcommerzSuccess(@Body() body: SslcommerzReturnDto, @Res() res: Response): void {
    res.redirect(HttpStatus.FOUND, this.webhooks.advisoryRedirect(body.tran_id, 'success').redirectUrl);
  }

  @Post('sslcommerz/fail')
  @SkipEnvelope()
  @ApiExcludeEndpoint()
  sslcommerzFail(@Body() body: SslcommerzReturnDto, @Res() res: Response): void {
    res.redirect(HttpStatus.FOUND, this.webhooks.advisoryRedirect(body.tran_id, 'fail').redirectUrl);
  }

  @Post('sslcommerz/cancel')
  @SkipEnvelope()
  @ApiExcludeEndpoint()
  sslcommerzCancel(@Body() body: SslcommerzReturnDto, @Res() res: Response): void {
    res.redirect(HttpStatus.FOUND, this.webhooks.advisoryRedirect(body.tran_id, 'cancel').redirectUrl);
  }
}
