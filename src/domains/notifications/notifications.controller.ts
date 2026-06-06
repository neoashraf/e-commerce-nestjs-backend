import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiHeader, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';

import { SkipEnvelope } from '../../shared/decorators/skip-envelope.decorator';
import { NotificationChannel } from './notification.enums';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PromotionalService } from './promotional.service';
import { WebhookVerificationService } from './webhook-verification';
import { DispatchDto } from './dto/dispatch.dto';
import { EmailEventDto, SmsDlrDto } from './dto/dlr-webhook.dto';

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly promotional: PromotionalService,
    private readonly webhookVerification: WebhookVerificationService,
  ) {}

  @Post('internal/notifications/dispatch')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Internal: dispatch a notification (SMS/email) by event type' })
  @ApiAcceptedResponse({ description: 'Queued notifications (or deduplicated)' })
  async dispatchNotification(@Body() dto: DispatchDto): Promise<{
    notifications: Array<{ id: string; channel: string; status: string }>;
    deduplicated: boolean;
  }> {
    return this.dispatch.dispatch({
      eventType: dto.event_type,
      locale: dto.locale,
      recipient: {
        customerId: dto.recipient.customer_id,
        adminUserId: dto.recipient.admin_user_id,
        phone: dto.recipient.phone,
        email: dto.recipient.email,
      },
      channels: dto.channels as NotificationChannel[] | undefined,
      relatedEntity: dto.related_entity,
      variables: dto.variables,
      idempotencyKey: dto.idempotency_key,
    });
  }

  @Post('webhooks/sms/dlr')
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @ApiHeader({ name: 'x-webhook-signature', required: false, description: 'HMAC-SHA256 of the raw body (provider secret)' })
  @ApiOperation({ summary: 'SMS delivery receipt (DLR) — provider status update (signature-verified)' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid webhook signature' })
  async smsDlr(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() dto: SmsDlrDto,
  ): Promise<{ received: boolean }> {
    this.webhookVerification.verify(NotificationChannel.SMS, req.rawBody, signature);
    const delivered = dto.status.toUpperCase() === 'DELIVERED';
    await this.dispatch.handleStatusUpdate(dto.message_ref, delivered);
    return { received: true };
  }

  @Post('webhooks/email/events')
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @ApiHeader({ name: 'x-webhook-signature', required: false, description: 'HMAC-SHA256 of the raw body (provider secret)' })
  @ApiOperation({ summary: 'Email delivery event — status update or promotional unsubscribe (signature-verified)' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid webhook signature' })
  async emailEvent(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() dto: EmailEventDto,
  ): Promise<{ received: boolean }> {
    this.webhookVerification.verify(NotificationChannel.EMAIL, req.rawBody, signature);
    const event = dto.event.toLowerCase();
    // Unsubscribe delegates a promotional-email opt-out to AUTH (FR-NOTIF-054); it is not a delivery state.
    if (event === 'unsubscribe') {
      if (dto.recipient) await this.promotional.applyEmailOptOut({ email: dto.recipient });
      return { received: true };
    }
    await this.dispatch.handleStatusUpdate(dto.message_ref, event === 'delivered');
    return { received: true };
  }
}
