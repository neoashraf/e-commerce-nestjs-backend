import { forwardRef, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { AdminNotificationEntity } from './entities/admin-notification.entity';
import { ChannelProviderConfigEntity } from './entities/channel-provider-config.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationTemplateVersionEntity } from './entities/notification-template-version.entity';
import { AdminNotificationBus } from './admin-notification-bus';
import { AdminNotificationService } from './admin-notification.service';
import { AdminNotificationFeedController } from './admin-notification-feed.controller';
import { RbacAdminRecipientResolver } from './rbac-admin-recipient.resolver';
import { ADMIN_RECIPIENT_RESOLVER } from './ports/admin-recipient-resolver.port';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsAdminController } from './notifications-admin.controller';
import { NotificationsAdminService } from './notifications-admin.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { CampaignController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { PromotionalService } from './promotional.service';
import { PromotionalDeferralTask } from './promotional-deferral.task';
import { DlrStaleTask } from './dlr-stale.task';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { WebhookVerificationService } from './webhook-verification';
import { UnsubscribeController } from './unsubscribe.controller';
import { OPT_IN_READER, StubOptInReader } from './ports/opt-in-reader.port';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';
import { ISmsProvider, SMS_PROVIDER } from './providers/sms-provider.interface';
import { SmtpEmailAdapter } from './providers/smtp-email.adapter';
import { StubSmsAdapter } from './providers/stub-sms.adapter';
import { TwilioSmsAdapter } from './providers/twilio-sms.adapter';

@Module({
  imports: [
    ConfigModule,
    // RBAC supplies the admin guard + permission gate for the template manager;
    // forwardRef per the project's circular module-wiring convention (RBAC also imports NOTIF).
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationTemplateEntity,
      NotificationTemplateVersionEntity,
      ChannelProviderConfigEntity,
      AdminNotificationEntity,
    ]),
  ],
  controllers: [
    NotificationsController,
    NotificationsAdminController,
    AdminNotificationFeedController,
    TemplatesController,
    CampaignController,
    SettingsController,
    UnsubscribeController,
  ],
  providers: [
    NotificationDispatchService,
    NotificationsAdminService,
    TemplatesService,
    PromotionalService,
    CampaignService,
    SettingsService,
    WebhookVerificationService,
    PromotionalDeferralTask,
    DlrStaleTask,
    // In-app admin feed (real-time new-order alerts): durable feed + SSE bus + RBAC-backed recipients.
    AdminNotificationService,
    AdminNotificationBus,
    { provide: ADMIN_RECIPIENT_RESOLVER, useClass: RbacAdminRecipientResolver },
    // Live Twilio SMS when its credentials are configured; otherwise the dev stub
    // (logs the SMS instead of sending). Keeps local/CI runnable with no gateway.
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ISmsProvider => {
        const logger = new Logger('SmsProvider');
        if (TwilioSmsAdapter.isConfigured(config)) {
          logger.log('SMS provider: Twilio (live).');
          return new TwilioSmsAdapter(config);
        }
        logger.warn('SMS provider: dev stub — Twilio not configured, SMS will be logged, not sent.');
        return new StubSmsAdapter();
      },
    },
    { provide: EMAIL_PROVIDER, useClass: SmtpEmailAdapter },
    { provide: OPT_IN_READER, useClass: StubOptInReader },
  ],
  exports: [
    NotificationDispatchService,
    TemplatesService,
    PromotionalService,
    AdminNotificationService,
  ],
})
export class NotificationsModule {}
