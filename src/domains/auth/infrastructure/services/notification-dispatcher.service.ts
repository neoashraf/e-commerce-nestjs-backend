import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  DispatchEmailVerificationCommand,
  DispatchMfaCodeCommand,
  DispatchMfaStateChangeCommand,
  DispatchOtpCommand,
  DispatchPasswordChangedCommand,
  DispatchPasswordResetCommand,
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
    const eventType = `otp.${command.purpose}`;
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
          verify_url: verifyLink,
          ttl_minutes: command.ttlMinutes,
        },
        idempotency_key: `auth.email_verify:${command.email}:${command.token.slice(0, 12)}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`NOTIF email-verify dispatch failed with status ${res.status}`);
    }
  }

  async dispatchPasswordReset(command: DispatchPasswordResetCommand): Promise<void> {
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');
    const resetLink = this.buildResetLink(command.token);

    if (!baseUrl) {
      // DEV stub — NOTIF not deployed yet; log the link so the flow is testable locally.
      this.logger.warn(`[DEV PASSWORD RESET] ${command.email} link=${resetLink}`);
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
        event_type: 'auth.password_reset',
        locale: 'bn',
        recipient: { email: command.email },
        channels: ['email'],
        variables: {
          name: command.fullName,
          reset_url: resetLink,
          ttl_minutes: command.ttlMinutes,
        },
        idempotency_key: `auth.password_reset:${command.email}:${command.token.slice(0, 12)}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`NOTIF password-reset dispatch failed with status ${res.status}`);
    }
  }

  async dispatchMfaCode(command: DispatchMfaCodeCommand): Promise<void> {
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');
    const recipient =
      command.channel === 'sms' ? { phone: command.phone } : { email: command.email };
    const target = command.channel === 'sms' ? command.phone : command.email;

    if (!baseUrl) {
      // DEV stub — NOTIF not deployed yet; log the code so the 2FA flow is testable locally.
      this.logger.warn(`[DEV MFA CODE] otp.login_2fa (${command.channel}) → ${target} code=${command.code}`);
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
        event_type: 'otp.login_2fa',
        locale: 'bn',
        recipient,
        channels: [command.channel],
        variables: { code: command.code, otp: command.code },
        idempotency_key: `otp.login_2fa:${target}:${Date.now()}`,
      }),
    });

    if (!res.ok) {
      throw new Error(`NOTIF MFA-code dispatch failed with status ${res.status}`);
    }
  }

  async dispatchMfaStateChange(command: DispatchMfaStateChangeCommand): Promise<void> {
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');
    const recipient =
      command.channel === 'sms' ? { phone: command.phone } : { email: command.email };
    const target = command.channel === 'sms' ? command.phone : command.email;
    const state = command.enabled ? 'enabled' : 'disabled';

    if (!baseUrl) {
      // DEV stub — NOTIF not deployed yet. Best-effort, non-fatal.
      this.logger.warn(`[DEV MFA STATE] auth.mfa_changed (${command.channel}) → ${target} ${state}`);
      return;
    }

    const token = this.config.get<string>('NOTIF_SERVICE_TOKEN');
    try {
      await fetch(`${baseUrl}/api/v1/internal/notifications/dispatch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          event_type: 'auth.mfa_changed',
          locale: 'bn',
          recipient,
          channels: [command.channel],
          variables: { state },
          idempotency_key: `auth.mfa_changed:${target}:${state}:${Date.now()}`,
        }),
      });
    } catch (err) {
      // A confirmation notice is best-effort; never fail the enable/disable action over it.
      this.logger.error(`MFA state-change notification failed: ${(err as Error).message}`);
    }
  }

  async dispatchPasswordChanged(command: DispatchPasswordChangedCommand): Promise<void> {
    const baseUrl = this.config.get<string>('NOTIF_DISPATCH_URL');
    // Prefer email; fall back to SMS if the account has no verified email.
    const channel: 'email' | 'sms' = command.email ? 'email' : 'sms';
    const recipient = channel === 'email' ? { email: command.email } : { phone: command.phone };
    const target = channel === 'email' ? command.email : command.phone;

    if (!target) {
      // Nothing verified to notify — silently skip (best-effort per FR-AUTH-038).
      return;
    }

    if (!baseUrl) {
      this.logger.warn(
        `[DEV PASSWORD CHANGED] auth.password_changed (${channel}) → ${target} event=${command.event}`,
      );
      return;
    }

    const token = this.config.get<string>('NOTIF_SERVICE_TOKEN');
    try {
      await fetch(`${baseUrl}/api/v1/internal/notifications/dispatch`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          event_type: 'auth.password_changed',
          locale: 'bn',
          recipient,
          channels: [channel],
          variables: { name: command.fullName, event: command.event },
          idempotency_key: `auth.password_changed:${target}:${command.event}:${Date.now()}`,
        }),
      });
    } catch (err) {
      // Non-fatal: the credential change already succeeded; the notice is a courtesy.
      this.logger.error(`password-changed notification failed: ${(err as Error).message}`);
    }
  }

  private buildVerifyLink(token: string): string {
    const base = this.config.get<string>('STOREFRONT_URL') ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/verify-email?token=${token}`;
  }

  private buildResetLink(token: string): string {
    const base = this.config.get<string>('STOREFRONT_URL') ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/reset-password?token=${token}`;
  }
}
