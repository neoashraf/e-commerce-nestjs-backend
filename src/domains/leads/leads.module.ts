import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { LeadAttachmentEntity } from './entities/lead-attachment.entity';
import { LeadMessageEntity } from './entities/lead-message.entity';
import { LeadEntity } from './entities/lead.entity';
import { CustomerLeadsController } from './customer-leads.controller';
import { LeadsController } from './leads.controller';
import { LeadReferenceService } from './lead-reference.service';
import { LeadsService } from './leads.service';
import { CAPTCHA_VERIFIER, ConfigCaptchaVerifier } from './ports/captcha-verifier.port';
import { LEAD_NOTIFIER, StubLeadNotifier } from './ports/lead-notifier.port';
import { ORDER_REF_RESOLVER, StubOrderRefResolver } from './ports/order-ref-resolver.port';

/**
 * Leads & Contact capture core (LEAD, SRS 08). Public submission with spam protection + claim evidence,
 * the NOTIF acknowledgement, and the customer My-Enquiries thread. Admin inbox/reply/handoff is built in
 * lead-inbox-be on top of the exported `LeadsService`. Cross-module seams (NOTIF ack, ORD order-ref,
 * CAPTCHA) are ports, stubbed until their real impls land. AUTH supplies the customer guard/strategy
 * (imported via `forwardRef()` per the project's module-wiring convention).
 */
@Module({
  imports: [
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([LeadEntity, LeadMessageEntity, LeadAttachmentEntity]),
  ],
  controllers: [LeadsController, CustomerLeadsController],
  providers: [
    LeadsService,
    LeadReferenceService,
    { provide: LEAD_NOTIFIER, useClass: StubLeadNotifier },
    { provide: ORDER_REF_RESOLVER, useClass: StubOrderRefResolver },
    { provide: CAPTCHA_VERIFIER, useClass: ConfigCaptchaVerifier },
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
