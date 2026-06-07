import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { EmailSendError, EmailSendResult, IEmailProvider } from './email-provider.interface';

/**
 * SMTP email adapter (nodemailer). Sends transactional email via the configured SMTP server.
 * Until SMTP creds are provided (no MAIL_HOST), it falls back to logging so the flow is testable
 * locally. Swap creds in at integration — same interface (FR-NOTIF-030/031).
 */
@Injectable()
export class SmtpEmailAdapter implements IEmailProvider {
  private readonly logger = new Logger(SmtpEmailAdapter.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): nodemailer.Transporter | null {
    const host = this.config.get<string>('MAIL_HOST');
    if (!host) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('MAIL_PORT') ?? 587),
        secure: this.config.get<string>('MAIL_SECURE') === 'true',
        auth: this.config.get<string>('MAIL_USER')
          ? { user: this.config.get<string>('MAIL_USER'), pass: this.config.get<string>('MAIL_PASS') }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(to: string, subject: string, html: string): Promise<EmailSendResult> {
    const from = this.config.get<string>('MAIL_FROM') ?? 'noreply@sportshop.com.bd';
    const transporter = this.getTransporter();

    if (!transporter) {
      // DEV fallback — no SMTP configured yet.
      const messageRef = `EMAIL-${randomUUID()}`;
      this.logger.warn(`[DEV EMAIL] ${from} → ${to} | ${subject} ref=${messageRef}`);
      return { messageRef };
    }

    try {
      const info = await transporter.sendMail({ from, to, subject, html });
      return { messageRef: info.messageId ?? `EMAIL-${randomUUID()}` };
    } catch (err) {
      throw new EmailSendError((err as Error).message, false);
    }
  }
}
