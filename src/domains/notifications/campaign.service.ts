import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationChannel, PromoOutcome } from './notification.enums';
import { computeSmsEncoding, renderTemplate } from './notification-render.util';
import { PromotionalService } from './promotional.service';
import { PromotionalRecipient } from './ports/opt-in-reader.port';
import { CampaignSendDto, CampaignSendResultDto, CampaignSummaryDto } from './dto/campaign.dto';

type CampaignTarget = PromotionalRecipient & { name?: string };

interface NormalizedCampaign {
  eventType: string;
  locale: string;
  channels: NotificationChannel[];
}

/**
 * Promotional campaign orchestration (§7.3). The dry-run evaluates the compliance gate per
 * (recipient × channel) and returns reach counts (eligible / opted_out / quiet_hours_deferred /
 * rate_limited / blocked_no_bn) + an SMS-segment estimate; the send fans the dispatch core over the
 * recipient set with a per-recipient idempotency key, tallying the real outcomes. Outcome counts are
 * at (recipient × channel) granularity; `total` is the recipient count.
 */
@Injectable()
export class CampaignService {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly promotional: PromotionalService,
    @InjectRepository(NotificationTemplateEntity)
    private readonly templates: Repository<NotificationTemplateEntity>,
  ) {}

  /** Preview reach without sending (FR-NOTIF-051–053, §7.3). */
  async dryRun(input: CampaignSendDto): Promise<CampaignSummaryDto> {
    const { eventType, channels } = this.normalize(input);
    const recipients = await this.resolveRecipients(input, channels);
    const summary = this.emptySummary(recipients.length);
    const segsPerSms = await this.smsSegmentsPerMessage(eventType);

    for (const r of recipients) {
      for (const channel of channels) {
        const address = channel === NotificationChannel.SMS ? r.phone : r.email;
        if (!address) continue;
        const verdict = await this.promotional.evaluate({ eventType, channel, recipient: r, address });
        this.tally(summary, verdict.outcome);
        if (
          channel === NotificationChannel.SMS &&
          (verdict.outcome === PromoOutcome.ELIGIBLE || verdict.outcome === PromoOutcome.QUIET_HOURS_DEFERRED)
        ) {
          summary.estimated_sms_segments += segsPerSms;
        }
      }
    }
    return summary;
  }

  /** Send a campaign to the recipient set, idempotently per recipient (FR-NOTIF-051–053, §7.3). */
  async send(input: CampaignSendDto): Promise<CampaignSendResultDto> {
    const { eventType, locale, channels } = this.normalize(input);
    const recipients = await this.resolveRecipients(input, channels);
    const summary = this.emptySummary(recipients.length);
    const segsPerSms = await this.smsSegmentsPerMessage(eventType);

    // BTRC bn-template presence is event-level; pre-check once so a missing bn template counts the SMS
    // portion as blocked rather than aborting the whole campaign with a 422.
    const smsBlocked = channels.includes(NotificationChannel.SMS) && !(await this.promotional.hasActiveBnSms(eventType));

    let sent = 0;
    let deferred = 0;
    let suppressed = 0;

    for (const r of recipients) {
      const variables = { name: r.name ?? 'Customer', ...(input.variables ?? {}) };
      const available = channels.filter((c) => (c === NotificationChannel.SMS ? r.phone : r.email));
      let dispatchChannels = available;
      if (smsBlocked && available.includes(NotificationChannel.SMS)) {
        summary.blocked_no_bn += 1;
        dispatchChannels = available.filter((c) => c !== NotificationChannel.SMS);
      }
      if (dispatchChannels.length === 0) continue;

      const keyBase = r.customerId ?? r.email ?? r.phone;
      const idempotencyKey = input.idempotency_prefix && keyBase ? `${input.idempotency_prefix}:${keyBase}` : undefined;

      const result = await this.dispatch.dispatch({
        eventType,
        locale,
        recipient: { customerId: r.customerId, phone: r.phone, email: r.email },
        channels: dispatchChannels,
        variables,
        idempotencyKey,
      });

      for (const n of result.notifications) {
        if (n.status === 'suppressed') {
          suppressed += 1;
          if (n.reason === PromoOutcome.OPTED_OUT) summary.opted_out += 1;
          else if (n.reason === PromoOutcome.RATE_LIMITED) summary.rate_limited += 1;
        } else if (n.deferred) {
          deferred += 1;
          summary.quiet_hours_deferred += 1;
          if (n.channel === NotificationChannel.SMS) summary.estimated_sms_segments += segsPerSms;
        } else {
          sent += 1;
          summary.eligible += 1;
          if (n.channel === NotificationChannel.SMS) summary.estimated_sms_segments += segsPerSms;
        }
      }
    }

    return { event_type: eventType, sent, deferred, suppressed, summary };
  }

  // ---- internals -----------------------------------------------------------

  private normalize(input: CampaignSendDto): NormalizedCampaign {
    return {
      eventType: input.event_type ?? 'promo.campaign',
      locale: input.locale ?? 'bn',
      channels: input.channels as NotificationChannel[],
    };
  }

  private async resolveRecipients(
    input: CampaignSendDto,
    channels: NotificationChannel[],
  ): Promise<CampaignTarget[]> {
    if (input.recipient_source === 'all_opted_in') {
      const byKey = new Map<string, CampaignTarget>();
      for (const channel of channels) {
        for (const r of await this.promotional.listOptedIn(channel)) {
          const key = r.customerId ?? r.email ?? r.phone ?? '';
          if (key) byKey.set(key, { ...byKey.get(key), ...r });
        }
      }
      return [...byKey.values()];
    }
    const list = input.recipients ?? [];
    if (list.length === 0) {
      throw new BadRequestException({
        code: 'NO_RECIPIENTS',
        message: 'recipients are required when recipient_source is explicit',
      });
    }
    return list.map((r) => ({ customerId: r.customer_id, phone: r.phone, email: r.email, name: r.name }));
  }

  /** Approximate SMS segments for one message from the active bn SMS template (0 when none exists). */
  private async smsSegmentsPerMessage(eventType: string): Promise<number> {
    const tpl = await this.templates.findOne({
      where: { eventType, channel: NotificationChannel.SMS, locale: 'bn', isActive: true },
    });
    if (!tpl) return 0;
    const sample = renderTemplate(tpl.body, { name: 'Customer' });
    return computeSmsEncoding(sample).segments;
  }

  private emptySummary(total: number): CampaignSummaryDto {
    return {
      total,
      eligible: 0,
      opted_out: 0,
      quiet_hours_deferred: 0,
      rate_limited: 0,
      blocked_no_bn: 0,
      estimated_sms_segments: 0,
    };
  }

  private tally(summary: CampaignSummaryDto, outcome: PromoOutcome): void {
    switch (outcome) {
      case PromoOutcome.ELIGIBLE:
        summary.eligible += 1;
        break;
      case PromoOutcome.OPTED_OUT:
        summary.opted_out += 1;
        break;
      case PromoOutcome.QUIET_HOURS_DEFERRED:
        summary.quiet_hours_deferred += 1;
        break;
      case PromoOutcome.RATE_LIMITED:
        summary.rate_limited += 1;
        break;
      case PromoOutcome.BLOCKED_NO_BN:
        summary.blocked_no_bn += 1;
        break;
    }
  }
}
