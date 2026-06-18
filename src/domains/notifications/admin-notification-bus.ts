import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

import { AdminNotificationEntity } from './entities/admin-notification.entity';

/** Serialized in-app notification as sent over SSE and returned by the feed REST endpoints. */
export interface AdminNotificationView {
  id: string;
  event_type: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  related_entity: { type: string; id: string | null } | null;
  is_read: boolean;
  created_at: string;
}

export function toAdminNotificationView(n: AdminNotificationEntity): AdminNotificationView {
  return {
    id: n.id,
    event_type: n.eventType,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    data: n.data,
    related_entity: n.relatedEntityType
      ? { type: n.relatedEntityType, id: n.relatedEntityId }
      : null,
    is_read: n.isRead,
    created_at: n.createdAt.toISOString(),
  };
}

interface BusMessage {
  adminId: string;
  view: AdminNotificationView;
}

/**
 * In-process pub/sub for real-time admin notifications (FR-NOTIF-071). The dispatch path publishes
 * each newly-created feed row; the SSE endpoint subscribes to the stream for its connected admin.
 *
 * This is a single-instance bus (an RxJS Subject). The durable `admin_notifications` table is the
 * authoritative store (BR-NOTIF-11) — the bus only accelerates delivery to already-connected admins;
 * a push missed because of a disconnect is recovered by the client re-syncing the feed (FR-NOTIF-072).
 * A multi-instance deployment would back this with Redis pub/sub (noted as a future upgrade).
 */
@Injectable()
export class AdminNotificationBus {
  private readonly subject = new Subject<BusMessage>();

  /** Publish a newly-created notification to any connected stream for its recipient admin. */
  publish(adminId: string, view: AdminNotificationView): void {
    this.subject.next({ adminId, view });
  }

  /** Live stream of notifications addressed to one admin (FR-NOTIF-071, scoped per FR-NOTIF-075). */
  streamFor(adminId: string): Observable<AdminNotificationView> {
    return new Observable<AdminNotificationView>((subscriber) => {
      const sub = this.subject
        .pipe(filter((m) => m.adminId === adminId))
        .subscribe((m) => subscriber.next(m.view));
      return () => sub.unsubscribe();
    });
  }
}
