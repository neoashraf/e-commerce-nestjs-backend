import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { ChannelProviderConfigEntity } from './entities/channel-provider-config.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationTemplateVersionEntity } from './entities/notification-template-version.entity';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationsController } from './notifications.controller';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { EMAIL_PROVIDER } from './providers/email-provider.interface';
import { SMS_PROVIDER } from './providers/sms-provider.interface';
import { SmtpEmailAdapter } from './providers/smtp-email.adapter';
import { StubSmsAdapter } from './providers/stub-sms.adapter';

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
    ]),
  ],
  controllers: [NotificationsController, TemplatesController],
  providers: [
    NotificationDispatchService,
    TemplatesService,
    { provide: SMS_PROVIDER, useClass: StubSmsAdapter },
    { provide: EMAIL_PROVIDER, useClass: SmtpEmailAdapter },
  ],
  exports: [NotificationDispatchService, TemplatesService],
})
export class NotificationsModule {}
