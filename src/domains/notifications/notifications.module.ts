import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChannelProviderConfigEntity } from './entities/channel-provider-config.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsController } from './notifications.controller';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';
import { SMS_PROVIDER } from './providers/sms-provider.interface';
import { SmtpEmailAdapter } from './providers/smtp-email.adapter';
import { StubSmsAdapter } from './providers/stub-sms.adapter';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationTemplateEntity,
      ChannelProviderConfigEntity,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationDispatchService,
    { provide: SMS_PROVIDER, useClass: StubSmsAdapter },
    { provide: EMAIL_PROVIDER, useClass: SmtpEmailAdapter },
  ],
  exports: [NotificationDispatchService],
})
export class NotificationsModule {}
