import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';

import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
  PromoOutcome,
  SenderRoute,
} from './notification.enums';
import { getEventDefinition } from './event-catalog';
import { renderTemplate } from './notification-render.util';
import { PromotionalService } from './promotional.service';
import { mintUnsubscribeToken } from './unsubscribe-token.util';
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
  notifications: Array<{
    id: string;
    channel: string;
    status: string;
    /** Suppression reason (`opted_out` / `rate_limited`) when status is `suppressed`. */
    reason?: string | null;
    /** True when a promotional send was deferred by quiet hours (status stays `queued`). */
    deferred?: boolean;
  }>;
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
    private readonly promotional: PromotionalService,
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

    const isPromotional = def.category === NotificationCategory.PROMOTIONAL;
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

      // Promotional compliance gate (FR-NOTIF-051–053). Transactional traffic is never gated (BR-NOTIF-1).
      let suppressReason: string | null = null;
      let deferredUntil: Date | null = null;
      if (isPromotional) {
        const verdict = await this.promotional.evaluate({
          eventType: input.eventType,
          channel,
          recipient: input.recipient,
          address,
        });
        if (verdict.outcome === PromoOutcome.BLOCKED_NO_BN) {
          // BTRC: promotional SMS without a bn template is blocked, never sent in English (FR-NOTIF-013).
          throw new UnprocessableEntityException({
            code: 'NO_BANGLA_TEMPLATE',
            message: 'Promotional SMS requires a bn template.',
          });
        }
        if (verdict.outcome === PromoOutcome.OPTED_OUT) suppressReason = PromoOutcome.OPTED_OUT;
        else if (verdict.outcome === PromoOutcome.RATE_LIMITED) suppressReason = PromoOutcome.RATE_LIMITED;
        else if (verdict.outcome === PromoOutcome.QUIET_HOURS_DEFERRED) deferredUntil = verdict.deferUntil;
      }

      // Promotional SMS must render the Bangla template (BTRC) — no English fallback.
      const forceBn = isPromotional && channel === NotificationChannel.SMS;
      const template = await this.resolveTemplate(
        input.eventType,
        channel,
        forceBn ? 'bn' : locale,
        !forceBn,
      );
      if (!template) {
        throw new BadRequestException({
          code: 'NO_TEMPLATE',
          message: `No template for ${input.eventType}/${channel}`,
        });
      }
      const subject = template.subject ? this.render(template.subject, input.variables) : null;
      let body = this.render(template.body, input.variables);
      // Promotional email carries a one-click unsubscribe link (FR-NOTIF-032).
      if (isPromotional && channel === NotificationChannel.EMAIL) {
        body = this.appendUnsubscribeLink(body, input.recipient, address);
      }

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
        status: suppressReason ? NotificationStatus.SUPPRESSED : NotificationStatus.QUEUED,
        failureReason: suppressReason,
        deferredUntil,
        attempts: 0,
        idempotencyKey: input.idempotencyKey ?? null,
      });
      await this.notifs.save(notif);

      // Suppressed sends are logged, not delivered; deferred sends wait for the sweeper (FR-NOTIF-052).
      if (!suppressReason && !deferredUntil) {
        await this.deliver(notif, channel, address, subject, body);
      }
      results.push({
        id: notif.id,
        channel,
        status: notif.status,
        reason: suppressReason,
        deferred: !!deferredUntil,
      });
    }

    return { notifications: results, deduplicated: false };
  }

  /**
   * Deliver promotional sends whose quiet-hours deferral has elapsed (FR-NOTIF-052, §12.10). Driven by
   * `PromotionalDeferralTask`; idempotent — each due notification is cleared of `deferred_until` before
   * delivery so an overlapping run cannot send it twice. Returns the number delivered.
   */
  async processDueDeferrals(limit = 100): Promise<number> {
    const due = await this.notifs.find({
      where: {
        status: NotificationStatus.QUEUED,
        category: NotificationCategory.PROMOTIONAL,
        deferredUntil: LessThanOrEqual(new Date()),
      },
      take: limit,
    });
    let delivered = 0;
    for (const notif of due) {
      notif.deferredUntil = null;
      await this.notifs.save(notif);
      await this.deliver(
        notif,
        notif.channel as NotificationChannel,
        notif.recipientAddress,
        notif.renderedSubject,
        notif.renderedBody,
      );
      delivered++;
    }
    return delivered;
  }

  /** Append the tokenized one-click unsubscribe link required on promotional email (FR-NOTIF-032/054). */
  private appendUnsubscribeLink(body: string, recipient: DispatchRecipient, email: string): string {
    const secret = this.config.get<string>('NOTIF_UNSUBSCRIBE_SECRET') ?? 'dev-unsubscribe-secret';
    const base = (this.config.get<string>('PUBLIC_BASE_URL') ?? 'http://localhost:8000').replace(/\/+$/, '');
    const token = mintUnsubscribeToken({ email, customerId: recipient.customerId }, secret);
    const url = `${base}/api/v1/notifications/unsubscribe?token=${token}`;
    return `${body}\n\n—\nTo stop promotional emails, unsubscribe: ${url}`;
  }

  /**
   * Resend an existing notification (FR-NOTIF-062, §12.11). Clones the original's already-rendered
   * content into a fresh `queued` record linked via `resent_from_id` and re-delivers through the
   * dispatch core. Re-rendering from the template is intentionally avoided: the original dispatch
   * variables are not persisted, so replaying the stored rendered subject/body is the faithful resend.
   * A suppressed/deferred original is re-sent normally (the admin is overriding); the `flagged` result
   * marks a resend of an already-`delivered` message (allowed but flagged, §12.11).
   */
  async resend(originalId: string): Promise<{ id: string; resentFromId: string; status: string; flagged: boolean } | null> {
    const original = await this.notifs.findOne({ where: { id: originalId } });
    if (!original) return null;

    const flagged = original.status === NotificationStatus.DELIVERED;
    const clone = this.notifs.create({
      id: randomUUID(),
      eventType: original.eventType,
      category: original.category,
      channel: original.channel,
      locale: original.locale,
      customerId: original.customerId,
      adminUserId: original.adminUserId,
      recipientAddress: original.recipientAddress,
      relatedEntityType: original.relatedEntityType,
      relatedEntityId: original.relatedEntityId,
      templateId: original.templateId,
      templateVersion: original.templateVersion,
      renderedSubject: original.renderedSubject,
      renderedBody: original.renderedBody,
      smsSenderRoute: original.smsSenderRoute,
      status: NotificationStatus.QUEUED,
      failureReason: null,
      attempts: 0,
      // Fresh idempotency identity so the resend is never deduplicated against the original.
      idempotencyKey: null,
      resentFromId: original.id,
      deferredUntil: null,
    });
    await this.notifs.save(clone);
    // The contract acknowledges the resend at enqueue (`queued`); delivery proceeds as a side effect.
    const enqueuedStatus = clone.status;

    await this.deliver(
      clone,
      clone.channel as NotificationChannel,
      clone.recipientAddress,
      clone.renderedSubject,
      clone.renderedBody,
    );

    return { id: clone.id, resentFromId: original.id, status: enqueuedStatus, flagged };
  }

  /**
   * DLR stale sweep (FR-NOTIF-041, §12.2 edge case 2): a `sent` notification whose delivery
   * receipt never arrives stays `sent` indefinitely. After `maxAgeMs` past the send, mark it
   * `unknown` rather than falsely reporting `delivered`. `updated_at` is the send timestamp —
   * a `sent` record receives no further writes until a DLR flips it, so it is a faithful age
   * proxy. Idempotent: marking it `unknown` removes it from the next sweep. Returns the count.
   */
  async sweepStaleSent(maxAgeMs: number, limit = 200): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stale = await this.notifs.find({
      where: { status: NotificationStatus.SENT, updatedAt: LessThanOrEqual(cutoff) },
      take: limit,
    });
    for (const notif of stale) {
      notif.status = NotificationStatus.UNKNOWN;
      notif.failureReason = 'dlr_timeout';
      await this.notifs.save(notif);
    }
    return stale.length;
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
    allowFallback = true,
  ): Promise<NotificationTemplateEntity | null> {
    const exact = await this.templates.findOne({ where: { eventType, channel, locale, isActive: true } });
    if (exact || !allowFallback) return exact;
    return this.templates.findOne({ where: { eventType, channel, locale: 'en', isActive: true } });
  }

  /** Apply a promotional-email opt-out for a verified unsubscribe token's recipient (FR-NOTIF-054). */
  async applyEmailUnsubscribe(recipient: { email: string; customerId?: string }): Promise<void> {
    await this.promotional.applyEmailOptOut(recipient);
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
