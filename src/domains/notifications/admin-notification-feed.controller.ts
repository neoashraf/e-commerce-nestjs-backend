import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Observable, interval, merge } from 'rxjs';
import { map } from 'rxjs/operators';

import { SkipEnvelope } from '../../shared/decorators/skip-envelope.decorator';
import { DataWithMeta } from '../../shared/dto/data-with-meta';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../rbac/presentation/decorators/current-admin.decorator';
import { AdminSseAuthGuard } from '../rbac/presentation/guards/admin-sse-auth.guard';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { AdminNotificationView } from './admin-notification-bus';
import { AdminNotificationService } from './admin-notification.service';
import { AdminFeedQueryDto } from './dto/admin-notification-feed.dto';

/** SSE keep-alive cadence: a `ping` comment every 25s so idle proxies don't drop the connection. */
const SSE_KEEPALIVE_MS = 25_000;

interface FeedMeta {
  page: number;
  limit: number;
  total: number;
  unread: number;
}

/**
 * The signed-in admin's in-app notification feed — the topbar bell (NOTIF SRS 09 §5.8; contract:
 * In-App Admin Feed). Every operation is scoped to the authenticated admin (`recipient_admin_id`);
 * a row owned by another admin is invisible here. REST routes use header-based admin auth; the SSE
 * stream uses a `?token=` query param (EventSource cannot set headers) via {@link AdminSseAuthGuard}.
 */
@ApiTags('Notifications — In-App Admin Feed')
@Controller('admin/notification-feed')
export class AdminNotificationFeedController {
  constructor(private readonly service: AdminNotificationService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'List my in-app notifications, most-recent-first (FR-NOTIF-073)' })
  @ApiOkResponse({ description: 'Paginated feed with meta.unread' })
  async list(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Query() query: AdminFeedQueryDto,
  ): Promise<DataWithMeta<AdminNotificationView[], FeedMeta>> {
    const result = await this.service.listForAdmin(admin.adminId, {
      unread: query.unread === 'true',
      page: query.page,
      limit: query.limit,
    });
    return new DataWithMeta(result.rows, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      unread: result.unread,
    });
  }

  @Get('unread-count')
  @ApiBearerAuth()
  @UseGuards(JwtAdminGuard)
  @ApiOperation({ summary: 'My current unread count (FR-NOTIF-073)' })
  @ApiOkResponse({ description: '{ unread }' })
  async unreadCount(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<{ unread: number }> {
    return { unread: await this.service.unreadCount(admin.adminId) };
  }

  @Sse('stream')
  @SkipEnvelope()
  @UseGuards(AdminSseAuthGuard)
  @ApiOperation({
    summary: 'Real-time SSE stream of my new in-app notifications (FR-NOTIF-071/075)',
    description:
      'Server-Sent Events. The admin access token is passed as the `token` query param because ' +
      'EventSource cannot set an Authorization header. Emits named `notification` events plus `ping` keep-alives.',
  })
  @ApiQuery({ name: 'token', required: true, description: 'Admin access JWT (aud=admin)' })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid/expired token or non-admin token' })
  stream(@CurrentAdmin() admin: AuthenticatedAdmin): Observable<MessageEvent> {
    const notifications = this.service.streamFor(admin.adminId).pipe(
      map((view): MessageEvent => ({ type: 'notification', data: view })),
    );
    const keepAlive = interval(SSE_KEEPALIVE_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: '' })),
    );
    return merge(notifications, keepAlive);
  }

  @Post('read-all')
  @ApiBearerAuth()
  @UseGuards(JwtAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all my unread notifications read (FR-NOTIF-074)' })
  @ApiOkResponse({ description: '{ marked, unread }' })
  async markAllRead(
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<{ marked: number; unread: number }> {
    return this.service.markAllRead(admin.adminId);
  }

  @Post(':id/read')
  @ApiBearerAuth()
  @UseGuards(JwtAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one of my notifications read; idempotent (FR-NOTIF-074)' })
  @ApiOkResponse({ description: '{ id, is_read, unread }' })
  async markRead(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string; is_read: boolean; unread: number }> {
    const result = await this.service.markRead(admin.adminId, id);
    return { id: result.id, is_read: result.isRead, unread: result.unread };
  }
}
