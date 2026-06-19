import { Injectable, Logger } from '@nestjs/common';

import { IAdminNotificationDispatcher } from '../../application/ports/admin-notification.port';
import { TwofaChannel } from '../../domain/enums/twofa-channel.enum';
import { NotificationChannel } from '../../../notifications/notification.enums';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';

/**
 * Adapts the NOTIF dispatch service for admin 2FA / reset emails (call-only — FR-RBAC-002, 007).
 * Delivery failures are swallowed (logged) so the auth flow still returns a generic success.
 */
@Injectable()
export class NotifAdminNotificationService implements IAdminNotificationDispatcher {
  private readonly logger = new Logger(NotifAdminNotificationService.name);

  constructor(private readonly dispatch: NotificationDispatchService) {}

  async dispatchTwofaCode(input: {
    channel: TwofaChannel;
    phone: string | null;
    email: string;
    code: string;
    ttlMinutes: number;
  }): Promise<void> {
    const channel = input.channel === TwofaChannel.SMS ? NotificationChannel.SMS : NotificationChannel.EMAIL;
    try {
      await this.dispatch.dispatch({
        eventType: 'admin.2fa',
        recipient: { phone: input.phone ?? undefined, email: input.email },
        channels: [channel],
        variables: { code: input.code, ttl_minutes: input.ttlMinutes },
      });
    } catch (err) {
      this.logger.error('Admin 2FA dispatch failed', (err as Error)?.stack);
    }
  }

  async dispatchAdminInvite(input: {
    email: string;
    fullName: string;
    inviteUrl: string;
  }): Promise<void> {
    try {
      await this.dispatch.sendTransactionalEmail({
        email: input.email,
        eventType: 'admin.invite',
        variables: { name: input.fullName, invite_url: input.inviteUrl },
      });
    } catch (err) {
      this.logger.error('Admin invite dispatch failed', (err as Error)?.stack);
    }
  }

  async dispatchPasswordReset(input: {
    email: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void> {
    try {
      await this.dispatch.sendTransactionalEmail({
        email: input.email,
        eventType: 'admin.password_reset',
        variables: { name: input.fullName, reset_url: input.resetUrl },
      });
    } catch (err) {
      this.logger.error('Admin password-reset dispatch failed', (err as Error)?.stack);
    }
  }
}
