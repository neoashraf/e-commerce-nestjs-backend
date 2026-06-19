import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { LeadAttachmentEntity } from './entities/lead-attachment.entity';
import { LeadMessageEntity } from './entities/lead-message.entity';
import { LeadEntity } from './entities/lead.entity';
import { CustomerLeadsController } from './customer-leads.controller';
import { LeadsController } from './leads.controller';
import { LeadsAdminController } from './leads-admin.controller';
import { LeadReferenceService } from './lead-reference.service';
import { LeadsService } from './leads.service';
import { LeadsAdminService } from './leads-admin.service';
import { NotifLeadNotifier } from './infrastructure/notif-lead-notifier.service';
import { TurnstileCaptchaVerifier } from './infrastructure/turnstile-captcha.verifier';
import {
  CAPTCHA_VERIFIER,
  ConfigCaptchaVerifier,
  ICaptchaVerifier,
} from './ports/captcha-verifier.port';
import { EXCHANGE_HANDOFF, StubExchangeHandoff } from './ports/exchange-handoff.port';
import { LEAD_NOTIFIER } from './ports/lead-notifier.port';
import { ORDER_REF_RESOLVER, StubOrderRefResolver } from './ports/order-ref-resolver.port';

/**
 * Leads & Contact capture core (LEAD, SRS 08). Public submission with spam protection + claim evidence,
 * the NOTIF acknowledgement, and the customer My-Enquiries thread. The admin inbox (lead-inbox-be) adds
 * list/detail/assign/reply/notes/status + the claim → exchange/cancel handoff, gated by `leads.lead.*`
 * (RbacModule supplies the admin guard + PermissionService; the handoff also checks `orders.exchange.review`).
 * Cross-module seams (NOTIF ack/reply, ORD order-ref + exchange handoff, CAPTCHA) are ports, stubbed until
 * their real impls land. AUTH/RBAC are imported via `forwardRef()` per the project's module-wiring convention.
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => RbacModule),
    NotificationsModule,
    TypeOrmModule.forFeature([LeadEntity, LeadMessageEntity, LeadAttachmentEntity]),
  ],
  controllers: [LeadsController, CustomerLeadsController, LeadsAdminController],
  providers: [
    LeadsService,
    LeadsAdminService,
    LeadReferenceService,
    { provide: LEAD_NOTIFIER, useClass: NotifLeadNotifier },
    { provide: ORDER_REF_RESOLVER, useClass: StubOrderRefResolver },
    { provide: EXCHANGE_HANDOFF, useClass: StubExchangeHandoff },
    // CAPTCHA provider chosen by config (FR-LEAD-006): `turnstile` → real siteverify, else the
    // config stub. Both bypass when LEAD_CAPTCHA_ENABLED ≠ true (dev).
    {
      provide: CAPTCHA_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ICaptchaVerifier =>
        config.get<string>('LEAD_CAPTCHA_PROVIDER', 'stub') === 'turnstile'
          ? new TurnstileCaptchaVerifier(config)
          : new ConfigCaptchaVerifier(config),
    },
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
