import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChannelProviderConfigEntity } from './entities/channel-provider-config.entity';
import { NotificationEntity } from './entities/notification.entity';
import { NotificationTemplateEntity } from './entities/notification-template.entity';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
  PromoOutcome,
} from './notification.enums';
import { IOptInReader, OPT_IN_READER, PromotionalRecipient } from './ports/opt-in-reader.port';

/** Verdict of the promotional gate for one (recipient × channel). */
export interface PromoVerdict {
  outcome: PromoOutcome;
  /** Set only for `QUIET_HOURS_DEFERRED` — the next time the send is allowed. */
  deferUntil: Date | null;
}

export interface PromoGateInput {
  eventType: string;
  channel: NotificationChannel;
  recipient: PromotionalRecipient;
  /** The resolved recipient address actually used (phone for SMS, email for email). */
  address: string;
}

const SENDABLE_STATUSES = [
  NotificationStatus.QUEUED,
  NotificationStatus.SENDING,
  NotificationStatus.SENT,
  NotificationStatus.DELIVERED,
];

/**
 * Promotional compliance gate (FR-NOTIF-051–053, BR-NOTIF-1/2). Evaluates a single promotional
 * (recipient × channel) for opt-in, Bangla-template presence (SMS/BTRC), the per-recipient daily
 * rate limit, and quiet hours — returning a verdict the dispatch path acts on (suppress / defer /
 * send) without touching transactional traffic. Pure decision logic: it never sends or persists.
 */
@Injectable()
export class PromotionalService {
  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly templates: Repository<NotificationTemplateEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notifs: Repository<NotificationEntity>,
    @InjectRepository(ChannelProviderConfigEntity)
    private readonly providerConfig: Repository<ChannelProviderConfigEntity>,
    @Inject(OPT_IN_READER) private readonly optIn: IOptInReader,
    private readonly config: ConfigService,
  ) {}

  /** Evaluate the gate for one promotional (recipient × channel) (FR-NOTIF-051–053). */
  async evaluate(input: PromoGateInput): Promise<PromoVerdict> {
    // 1) BTRC: promotional SMS requires an active Bangla template, else block (FR-NOTIF-013/052).
    if (input.channel === NotificationChannel.SMS && !(await this.hasActiveBnSms(input.eventType))) {
      return { outcome: PromoOutcome.BLOCKED_NO_BN, deferUntil: null };
    }

    // 2) Opt-in (FR-NOTIF-051): not opted in → suppress.
    if (!(await this.optIn.isOptedIn(input.channel, input.recipient))) {
      return { outcome: PromoOutcome.OPTED_OUT, deferUntil: null };
    }

    // 3) Per-recipient daily rate limit (FR-NOTIF-053).
    if (await this.isRateLimited(input.recipient, input.address)) {
      return { outcome: PromoOutcome.RATE_LIMITED, deferUntil: null };
    }

    // 4) Quiet hours (FR-NOTIF-052): defer, never drop.
    const deferUntil = await this.quietHoursDeferUntil(input.channel);
    if (deferUntil) {
      return { outcome: PromoOutcome.QUIET_HOURS_DEFERRED, deferUntil };
    }

    return { outcome: PromoOutcome.ELIGIBLE, deferUntil: null };
  }

  /** Whether an active `bn` SMS template exists for the event type (FR-NOTIF-013). */
  async hasActiveBnSms(eventType: string): Promise<boolean> {
    const count = await this.templates.count({
      where: { eventType, channel: NotificationChannel.SMS, locale: 'bn', isActive: true },
    });
    return count > 0;
  }

  /** Daily promotional cap reached for this recipient over the rolling window (FR-NOTIF-053). */
  private async isRateLimited(recipient: PromotionalRecipient, address: string): Promise<boolean> {
    const cap = Number(this.config.get<string>('NOTIF_PROMO_DAILY_CAP') ?? 2);
    if (cap <= 0) return false;
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const qb = this.notifs
      .createQueryBuilder('n')
      .where('n.category = :cat', { cat: NotificationCategory.PROMOTIONAL })
      .andWhere('n.status IN (:...statuses)', { statuses: SENDABLE_STATUSES })
      .andWhere('n.createdAt >= :since', { since });
    if (recipient.customerId) {
      qb.andWhere('(n.customerId = :cid OR n.recipientAddress = :addr)', {
        cid: recipient.customerId,
        addr: address,
      });
    } else {
      qb.andWhere('n.recipientAddress = :addr', { addr: address });
    }
    const sent = await qb.getCount();
    return sent >= cap;
  }

  /**
   * If `now` falls in the promotional quiet-hours window, the next allowed time; otherwise `null`.
   * Window comes from `ChannelProviderConfig` (per-channel, else any configured row), falling back to
   * `NOTIF_QUIET_HOURS_START/END` (default 22:00–08:00). `start === end` disables quiet hours.
   */
  private async quietHoursDeferUntil(channel: NotificationChannel): Promise<Date | null> {
    const window = await this.resolveQuietHours(channel);
    if (!window) return null;
    const { startMin, endMin } = window;
    if (startMin === endMin) return null;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const overnight = startMin > endMin;
    const inWindow = overnight ? nowMin >= startMin || nowMin < endMin : nowMin >= startMin && nowMin < endMin;
    if (!inWindow) return null;

    const target = new Date(now);
    target.setSeconds(0, 0);
    target.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    // Overnight window entered before midnight → end time is on the following day.
    if (overnight && nowMin >= startMin) target.setDate(target.getDate() + 1);
    return target;
  }

  private async resolveQuietHours(
    channel: NotificationChannel,
  ): Promise<{ startMin: number; endMin: number } | null> {
    const rows = await this.providerConfig.find({ where: { isActive: true } });
    const row =
      rows.find((r) => r.channel === channel && r.quietHoursStart && r.quietHoursEnd) ??
      rows.find((r) => r.quietHoursStart && r.quietHoursEnd);
    const start = row?.quietHoursStart ?? this.config.get<string>('NOTIF_QUIET_HOURS_START') ?? '22:00';
    const end = row?.quietHoursEnd ?? this.config.get<string>('NOTIF_QUIET_HOURS_END') ?? '08:00';
    const startMin = this.toMinutes(start);
    const endMin = this.toMinutes(end);
    if (startMin === null || endMin === null) return null;
    return { startMin, endMin };
  }

  private toMinutes(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }

  /** Recipients to target for an "all opted-in" campaign source (SRS §7.3, minimal path). */
  listOptedIn(channel: NotificationChannel): Promise<PromotionalRecipient[]> {
    return this.optIn.listOptedIn(channel);
  }

  /** Apply a promotional-email opt-out via the AUTH seam (FR-NOTIF-054). */
  applyEmailOptOut(recipient: PromotionalRecipient): Promise<void> {
    return this.optIn.setEmailOptOut(recipient);
  }
}
