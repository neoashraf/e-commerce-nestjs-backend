import { randomUUID } from 'crypto';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationChannel, NotificationStatus, SenderRoute } from './notification.enums';
import { getEventDefinition } from './event-catalog';
import { renderTemplate } from './notification-render.util';
import { EMAIL_PROVIDER, IEmailProvider } from './providers/email-provider.interface';
import { ISmsProvider, SMS_PROVIDER, SmsSendError } from './providers/sms-provider.interface';
import { EmailSendError } from './providers/email-provider.interface';

const BD_MOBILE = /^\+8801[3-9]\d{8}$/;

export interface DispatchRecipient {
  customerId?: string;
  adminUserId?: string;
  phone?: string;
  email?: string;
}

export interface DispatchInput {
  eventType: string;
  locale?: string;
  recipient: DispatchRecipient;
  channels?: NotificationChannel[];
  relatedEntity?: { type: string; id: string };
  variables: Record<string, string | number>;
  idempotencyKey?: string;
}

export interface DispatchResult {
  notifications: Array<{ id: string; channel: string; status: string }>;
  deduplicated: boolean;
}

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    @InjectRepository(NotificationEntity) private readonly notifs: Repository<NotificationEntity>,
    @InjectRepository(NotificationTemplateEntity)
    private readonly templates: Repository<NotificationTemplateEntity>,
    @Inject(SMS_PROVIDER) private readonly sms: ISmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: IEmailProvider,
    private readonly config: ConfigService,
  ) {}

  /** Typed wrapper for OTP SMS (AUTH/RBAC call this). */
  async sendOtp(input: {
    phone: string;
    eventType: string;
    code: string;
    ttlMinutes: number;
    locale?: string;
    idempotencyKey?: string;
  }): Promise<DispatchResult> {
    return this.dispatch({
      eventType: input.eventType,
      locale: input.locale,
      recipient: { phone: input.phone },
      channels: [NotificationChannel.SMS],
      variables: { code: input.code, ttl_minutes: input.ttlMinutes },
      idempotencyKey: input.idempotencyKey,
    });
  }

  /** Typed wrapper for transactional email (AUTH/RBAC call this). */
  async sendTransactionalEmail(input: {
    email: string;
    eventType: string;
    variables: Record<string, string | number>;
    locale?: string;
    idempotencyKey?: string;
  }): Promise<DispatchResult> {
    return this.dispatch({
      eventType: input.eventType,
      locale: input.locale,
      recipient: { email: input.email },
      channels: [NotificationChannel.EMAIL],
      variables: input.variables,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const def = getEventDefinition(input.eventType);
    if (!def) {
      throw new BadRequestException({ code: 'UNKNOWN_EVENT', message: `Unknown event_type: ${input.eventType}` });
    }
    const locale = input.locale ?? 'en';
    const requested = input.channels?.length ? input.channels : def.channels;

    for (const ch of requested) {
      if (!def.channels.includes(ch)) {
        throw new BadRequestException({
          code: 'CHANNEL_NOT_ALLOWED',
          message: `Channel ${ch} not allowed for ${input.eventType}`,
        });
      }
    }
    for (const ph of def.requiredPlaceholders) {
      if (input.variables[ph] === undefined || input.variables[ph] === null) {
        throw new BadRequestException({ code: 'MISSING_PLACEHOLDER', message: `Missing placeholder: ${ph}` });
      }
    }

    // Idempotency (FR-NOTIF-004) — return prior result within the 24h window.
    if (input.idempotencyKey) {
      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const existing = await this.notifs.find({
        where: { idempotencyKey: input.idempotencyKey, createdAt: MoreThanOrEqual(since) },
      });
      if (existing.length > 0) {
        return {
          notifications: existing.map((n) => ({ id: n.id, channel: n.channel, status: n.status })),
          deduplicated: true,
        };
      }
    }

    const results: DispatchResult['notifications'] = [];
    for (const channel of requested) {
      const address = channel === NotificationChannel.SMS ? input.recipient.phone : input.recipient.email;
      if (!address) {
        this.logger.warn(`Skipping ${channel} for ${input.eventType} — no recipient address`);
        continue; // edge case 9
      }
      if (channel === NotificationChannel.SMS && !BD_MOBILE.test(address)) {
        throw new BadRequestException({ code: 'INVALID_RECIPIENT', message: 'International numbers are not permitted.' });
      }

      const template = await this.resolveTemplate(input.eventType, channel, locale);
      if (!template) {
        throw new BadRequestException({
          code: 'NO_TEMPLATE',
          message: `No template for ${input.eventType}/${channel}`,
        });
      }
      const subject = template.subject ? this.render(template.subject, input.variables) : null;
      const body = this.render(template.body, input.variables);

      const notif = this.notifs.create({
        id: randomUUID(),
        eventType: input.eventType,
        category: def.category,
        channel,
        locale: template.locale,
        customerId: input.recipient.customerId ?? null,
        adminUserId: input.recipient.adminUserId ?? null,
        recipientAddress: address,
        relatedEntityType: input.relatedEntity?.type ?? null,
        relatedEntityId: input.relatedEntity?.id ?? null,
        templateId: template.id,
        templateVersion: template.version,
        renderedSubject: subject,
        renderedBody: body,
        status: NotificationStatus.QUEUED,
        attempts: 0,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      await this.notifs.save(notif);

      await this.deliver(notif, channel, address, subject, body);
      results.push({ id: notif.id, channel, status: notif.status });
    }

    return { notifications: results, deduplicated: false };
  }

  /** DLR / status webhook (FR-NOTIF-041): map provider ref → notification, update status. */
  async handleStatusUpdate(providerMessageRef: string, delivered: boolean): Promise<boolean> {
    const notif = await this.notifs.findOne({ where: { providerMessageRef } });
    if (!notif) return false;
    notif.status = delivered ? NotificationStatus.DELIVERED : NotificationStatus.FAILED;
    if (!delivered) notif.failureReason = 'provider_reported_failure';
    await this.notifs.save(notif);
    return true;
  }

  private async resolveTemplate(
    eventType: string,
    channel: string,
    locale: string,
  ): Promise<NotificationTemplateEntity | null> {
    return (
      (await this.templates.findOne({ where: { eventType, channel, locale, isActive: true } })) ??
      (await this.templates.findOne({ where: { eventType, channel, locale: 'en', isActive: true } }))
    );
  }

  private render(tpl: string, vars: Record<string, string | number>): string {
    return renderTemplate(tpl, vars);
  }

  /** Send with transient-retry (cap, FR-NOTIF-042) + permanent-fail short-circuit (FR-NOTIF-043). */
  private async deliver(
    notif: NotificationEntity,
    channel: NotificationChannel,
    address: string,
    subject: string | null,
    body: string,
  ): Promise<void> {
    const cap = Number(this.config.get<string>('NOTIF_RETRY_CAP') ?? 3);
    notif.status = NotificationStatus.SENDING;
    await this.notifs.save(notif);

    for (let attempt = 1; attempt <= cap; attempt++) {
      notif.attempts = attempt;
      try {
        if (channel === NotificationChannel.SMS) {
          const res = await this.sms.send(address, body);
          notif.smsSegments = res.segments;
          notif.smsSenderRoute = SenderRoute.NON_MASKING;
          notif.providerMessageRef = res.messageRef;
        } else {
          const res = await this.email.send(address, subject ?? '', body);
          notif.providerMessageRef = res.messageRef;
        }
        notif.status = NotificationStatus.SENT;
        await this.notifs.save(notif);
        return;
      } catch (err) {
        const permanent = err instanceof SmsSendError || err instanceof EmailSendError ? err.permanent : false;
        const code = err instanceof SmsSendError || err instanceof EmailSendError ? err.code : 'SEND_FAILED';
        if (permanent || attempt >= cap) {
          notif.status = NotificationStatus.FAILED;
          notif.failureReason = code;
          await this.notifs.save(notif);
          return;
        }
        // transient → loop and retry (next attempt)
      }
    }
  }
}
