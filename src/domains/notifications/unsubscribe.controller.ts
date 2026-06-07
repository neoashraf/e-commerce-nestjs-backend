import { Controller, Get, Header, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { SkipEnvelope } from '../../shared/decorators/skip-envelope.decorator';
import { NotificationDispatchService } from './notification-dispatch.service';
import { UnsubscribeQueryDto } from './dto/unsubscribe.dto';
import { verifyUnsubscribeToken } from './unsubscribe-token.util';

/**
 * Public, tokenized unsubscribe page (FR-NOTIF-054, §12.13). The token in a promotional email's link
 * identifies the recipient with no login; a valid token applies the promotional-email opt-out via the
 * AUTH seam and returns an HTML confirmation. Raw HTML (no `{data}` envelope).
 */
@ApiTags('Notifications — Unsubscribe')
@Controller('notifications/unsubscribe')
export class UnsubscribeController {
  constructor(
    private readonly dispatch: NotificationDispatchService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @SkipEnvelope()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Apply a promotional-email opt-out from a tokenized link (no login)' })
  async unsubscribe(@Query() query: UnsubscribeQueryDto): Promise<string> {
    const secret = this.config.get<string>('NOTIF_UNSUBSCRIBE_SECRET') ?? 'dev-unsubscribe-secret';
    const payload = verifyUnsubscribeToken(query.token ?? '', secret);
    if (!payload) {
      return this.page(
        'Invalid unsubscribe link',
        'This unsubscribe link is invalid or has expired. No changes were made.',
      );
    }
    await this.dispatch.applyEmailUnsubscribe({ email: payload.email, customerId: payload.customerId });
    return this.page(
      'You have been unsubscribed',
      `${this.escape(payload.email)} will no longer receive promotional emails. Transactional messages (orders, security) are unaffected.`,
    );
  }

  private page(title: string, message: string): string {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${this.escape(title)}</title></head>` +
      `<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#1f2937">` +
      `<h1 style="font-size:1.25rem">${this.escape(title)}</h1>` +
      `<p style="line-height:1.6">${message}</p></body></html>`;
  }

  private escape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
