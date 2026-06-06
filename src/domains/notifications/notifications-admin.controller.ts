import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../shared/dto/paginated';
import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import {
  NotificationDetail,
  NotificationListRow,
  NotificationsAdminService,
  ResendResult,
} from './notifications-admin.service';

/**
 * Admin delivery-log surface (NOTIF, SRS 09 §5.5/§5.7; contract: Delivery Log).
 * Read is PII-gated by `notifications.log.read`; resend by `notifications.log.resend`.
 */
@ApiTags('Notifications — Delivery Log')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/notifications')
export class NotificationsAdminController {
  constructor(private readonly admin: NotificationsAdminService) {}

  @Get()
  @Requires('notifications.log.read')
  @ApiOperation({
    summary: 'List/filter the delivery log (FR-NOTIF-060); scope to an entity via entity_type+entity_id (FR-NOTIF-044)',
  })
  @ApiOkResponse({ description: 'Paginated, filtered notification list' })
  @ApiForbiddenResponse({ description: 'Missing notifications.log.read' })
  async list(@Query() query: ListNotificationsDto): Promise<Paginated<NotificationListRow>> {
    const result = await this.admin.list(query);
    return new Paginated(result.rows, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  }

  @Get(':id')
  @Requires('notifications.log.read')
  @ApiOperation({ summary: 'Notification detail: rendered content (PII), template version, related entity, status history (FR-NOTIF-061)' })
  @ApiOkResponse({ description: 'Full notification detail with derived status history' })
  @ApiForbiddenResponse({ description: 'Missing notifications.log.read' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  async detail(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationDetail> {
    return this.admin.detail(id);
  }

  @Post(':id/resend')
  @Requires('notifications.log.resend')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Resend a notification: new record linked via resent_from_id, re-enqueued (FR-NOTIF-062)' })
  @ApiOkResponse({ description: 'New notification record created and queued' })
  @ApiForbiddenResponse({ description: 'Missing notifications.log.resend' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  async resend(@Param('id', ParseUUIDPipe) id: string): Promise<ResendResult> {
    return this.admin.resend(id);
  }
}
