import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DispatchEmailVerificationCommand,
  DispatchOtpCommand,
  INotificationDispatcher,
} from '../../application/ports/notification-dispatcher.port';

/**
 * Triggers the OTP SMS via the NOTIF module (FR-AUTH-021) — call only.
 * Until NOTIF is wired (no NOTIF_DISPATCH_URL), it runs as a DEV stub that logs the
 * code so the OTP flow is testable end-to-end locally. With a URL configured it POSTs
 * the dispatch contract (docs/api-contracts/09-notifications.md) and throws on failure
 * so the use-case can surface a 503 (AC2).
 */
@Injectable()
export class NotificationDispatcherService implements INotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcherService.name);

  constructor(private readonly config: ConfigService) {}

  async dispatchOtp(command: DispatchOtpCommand): Promise<void> {
    const eventType = command.purpose === 'register' ? 'otp.register' : 'otp.login';
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');

    if (!baseUrl) {
      // DEV stub — NOTIF not deployed yet.
      this.logger.warn(`[DEV OTP] ${eventType} → ${command.phone} code=${command.code}`);
      return;
    }

    const token = this.config.get<string>('NOTIF_SERVICE_TOKEN');
    const res = await fetch(`${baseUrl}/api/v1/internal/notifications/dispatch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event_type: eventType,
        locale: 'bn',
        recipient: { phone: command.phone },
        channels: ['sms'],
        variables: { code: command.code, otp: command.code },
        idempotency_key: `${eventType}:${command.phone}:${Date.now()}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`NOTIF dispatch failed with status ${res.status}`);
    }
  }

  async dispatchEmailVerification(command: DispatchEmailVerificationCommand): Promise<void> {
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');
    const verifyLink = this.buildVerifyLink(command.token);

    if (!baseUrl) {
      // DEV stub — NOTIF not deployed yet; log the link so the flow is testable locally.
      this.logger.warn(`[DEV EMAIL VERIFY] ${command.email} link=${verifyLink}`);
      return;
    }

    const token = this.config.get<string>('NOTIF_SERVICE_TOKEN');
    const res = await fetch(`${baseUrl}/api/v1/internal/notifications/dispatch`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event_type: 'auth.email_verify',
        locale: 'bn',
        recipient: { email: command.email },
        channels: ['email'],
        variables: {
          name: command.fullName,
          verify_link: verifyLink,
          ttl_minutes: command.ttlMinutes,
        },
        idempotency_key: `auth.email_verify:${command.email}:${command.token.slice(0, 12)}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`NOTIF email-verify dispatch failed with status ${res.status}`);
    }
  }

  private buildVerifyLink(token: string): string {
    const base = this.config.get<string>('STOREFRONT_URL') ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/verify-email?token=${token}`;
  }
}
