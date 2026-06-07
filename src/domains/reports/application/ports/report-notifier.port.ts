import { Injectable, Logger } from '@nestjs/common';

/** RPT notification events (FR-RPT-070/071): an export is ready to download, or a scheduled digest is sent. */
export type ReportNotificationEvent = 'report.export_ready' | 'report.digest';

/** Recipient + payload for a report notification (export-ready link, or a digest). */
export interface ReportNotification {
  adminId: string;
  email: string | null;
  reportKey: string;
  fileUrl: string | null;
  /** Export id for export-ready; schedule id for a digest. */
  refId: string;
  expiresAt: string | null;
}

/**
 * Outbound port to NOTIF for report delivery (FR-RPT-070/071). Real impl = notif-dispatch-be. Fired when
 * an export finishes (to the requester) and when a scheduled digest runs (to each active recipient —
 * suspended recipients are filtered out before this port is called). {@link StubReportNotifier} logs only.
 */
export interface IReportNotifier {
  notify(event: ReportNotificationEvent, notification: ReportNotification): Promise<void>;
}

export const REPORT_NOTIFIER = Symbol('IReportNotifier');

@Injectable()
export class StubReportNotifier implements IReportNotifier {
  private readonly logger = new Logger(StubReportNotifier.name);

  async notify(event: ReportNotificationEvent, notification: ReportNotification): Promise<void> {
    this.logger.log(`[stub] NOTIF ${event} ${JSON.stringify(notification)}`);
  }
}
