import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';

import { NotificationEntity } from './entities/notification.entity';
import { NotificationStatus } from './notification.enums';
import { NotificationDispatchService } from './notification-dispatch.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

/** A single status transition in a notification's lifecycle timeline (FR-NOTIF-061). */
export interface NotificationHistoryEntry {
  status: string;
  at: string;
}

export interface NotificationListRow {
  id: string;
  event_type: string;
  category: string;
  channel: string;
  recipient_address: string;
  status: string;
  failure_reason: string | null;
  sms_segments: number | null;
  attempts: number;
  created_at: string;
}

export interface NotificationDetail {
  id: string;
  event_type: string;
  channel: string;
  locale: string;
  recipient_address: string;
  related_entity: { type: string; id: string } | null;
  template_id: string | null;
  template_version: number | null;
  rendered_subject: string | null;
  rendered_body: string;
  status: string;
  failure_reason: string | null;
  attempts: number;
  sms_segments: number | null;
  sms_sender_route: string | null;
  provider_message_ref: string | null;
  resent_from_id: string | null;
  history: NotificationHistoryEntry[];
}

export interface ResendResult {
  id: string;
  resent_from_id: string;
  status: string;
}

/**
 * Admin read/resend surface over the existing delivery log (FR-NOTIF-044/060/061/062).
 * Pure query + resend orchestration; the send/status lifecycle lives in the dispatch core.
 */
@Injectable()
export class NotificationsAdminService {
  private readonly logger = new Logger(NotificationsAdminService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifs: Repository<NotificationEntity>,
    private readonly dispatch: NotificationDispatchService,
  ) {}

  /** Filtered, paginated delivery log (FR-NOTIF-060) — also the entity-scoped view (FR-NOTIF-044). */
  async list(query: ListNotificationsDto): Promise<{
    rows: NotificationListRow[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const where: FindOptionsWhere<NotificationEntity> = {};
    if (query.channel) where.channel = query.channel;
    if (query.status) where.status = query.status;
    if (query.event_type) where.eventType = query.event_type;
    if (query.recipient) where.recipientAddress = query.recipient;
    if (query.entity_type) where.relatedEntityType = query.entity_type;
    if (query.entity_id) where.relatedEntityId = query.entity_id;

    const createdAt = this.buildDateRange(query.from, query.to);
    if (createdAt) where.createdAt = createdAt;

    const [entities, total] = await this.notifs.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      rows: entities.map((n) => this.toRow(n)),
      page,
      limit,
      total,
    };
  }

  /** Full single-notification detail incl. rendered content + derived status history (FR-NOTIF-061). */
  async detail(id: string): Promise<NotificationDetail> {
    const n = await this.notifs.findOne({ where: { id } });
    if (!n) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    return {
      id: n.id,
      event_type: n.eventType,
      channel: n.channel,
      locale: n.locale,
      recipient_address: n.recipientAddress,
      related_entity:
        n.relatedEntityType && n.relatedEntityId
          ? { type: n.relatedEntityType, id: n.relatedEntityId }
          : null,
      template_id: n.templateId,
      template_version: n.templateVersion,
      rendered_subject: n.renderedSubject,
      rendered_body: n.renderedBody,
      status: n.status,
      failure_reason: n.failureReason,
      attempts: n.attempts,
      sms_segments: n.smsSegments,
      sms_sender_route: n.smsSenderRoute,
      provider_message_ref: n.providerMessageRef,
      resent_from_id: n.resentFromId,
      history: this.deriveHistory(n),
    };
  }

  /** Resend a notification (FR-NOTIF-062) — new linked record re-enqueued via the dispatch core. */
  async resend(id: string): Promise<ResendResult> {
    const result = await this.dispatch.resend(id);
    if (!result) {
      throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });
    }
    // Resending an already-delivered message is allowed but flagged for the audit trail (§12.11).
    if (result.flagged) {
      this.logger.warn(`Resend of already-delivered notification ${id} → new record ${result.id}`);
    }
    return {
      id: result.id,
      resent_from_id: result.resentFromId,
      status: result.status,
    };
  }

  private buildDateRange(from?: string, to?: string): FindOptionsWhere<NotificationEntity>['createdAt'] {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    const fromValid = fromDate && !Number.isNaN(fromDate.getTime());
    const toValid = toDate && !Number.isNaN(toDate.getTime());
    if (fromValid && toValid) return Between(fromDate, toDate);
    if (fromValid) return MoreThanOrEqual(fromDate);
    if (toValid) return LessThanOrEqual(toDate);
    return undefined;
  }

  private toRow(n: NotificationEntity): NotificationListRow {
    return {
      id: n.id,
      event_type: n.eventType,
      category: n.category,
      channel: n.channel,
      recipient_address: n.recipientAddress,
      status: n.status,
      failure_reason: n.failureReason,
      sms_segments: n.smsSegments,
      attempts: n.attempts,
      created_at: n.createdAt.toISOString(),
    };
  }

  /**
   * Derives the status timeline (FR-NOTIF-061). The dispatch core does not persist a per-status
   * timestamp ledger, so the timeline is reconstructed from the durable signals it does keep:
   * `created_at` (the `queued` moment) and `updated_at` (when the row reached its current status).
   * `sending` is transient and not separately stamped, so it is omitted; the source is `derived`.
   */
  private deriveHistory(n: NotificationEntity): NotificationHistoryEntry[] {
    const history: NotificationHistoryEntry[] = [
      { status: NotificationStatus.QUEUED, at: n.createdAt.toISOString() },
    ];
    if (n.status !== NotificationStatus.QUEUED) {
      history.push({ status: n.status, at: n.updatedAt.toISOString() });
    }
    return history;
  }
}
