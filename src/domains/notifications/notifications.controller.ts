import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { SkipEnvelope } from '../../shared/decorators/skip-envelope.decorator';
import { NotificationChannel } from './notification.enums';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PromotionalService } from './promotional.service';
import { DispatchDto } from './dto/dispatch.dto';
import { EmailEventDto, SmsDlrDto } from './dto/dlr-webhook.dto';

@ApiTags('Notifications')
@Controller()
export class NotificationsController {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly promotional: PromotionalService,
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
  @ApiOperation({ summary: 'SMS delivery receipt (DLR) — provider status update' })
  async smsDlr(@Body() dto: SmsDlrDto): Promise<{ received: boolean }> {
    const delivered = dto.status.toUpperCase() === 'DELIVERED';
    await this.dispatch.handleStatusUpdate(dto.message_ref, delivered);
    return { received: true };
  }

  @Post('webhooks/email/events')
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @ApiOperation({ summary: 'Email delivery event — status update or promotional unsubscribe' })
  async emailEvent(@Body() dto: EmailEventDto): Promise<{ received: boolean }> {
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
