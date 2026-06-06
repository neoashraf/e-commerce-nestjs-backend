import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService, SettingsView } from './settings.service';

/**
 * Provider settings admin surface (NOTIF, FR-NOTIF-063; contract: Provider Settings).
 * Super-Admin-grade — gated by `notifications.settings.manage`. `GET` never returns raw
 * credentials (only the `credentials_ref` pointer); `PUT` validates the masked sender ID.
 */
@ApiTags('Notifications — Provider Settings')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/notification-settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Requires('notifications.settings.manage')
  @ApiOperation({ summary: 'Read SMS + email provider settings — no raw credentials (FR-NOTIF-063)' })
  @ApiOkResponse({ description: 'SMS + email channel config (credentials_ref pointer only)' })
  @ApiForbiddenResponse({ description: 'Missing notifications.settings.manage' })
  async get(): Promise<SettingsView> {
    return this.settings.getSettings();
  }

  @Put()
  @Requires('notifications.settings.manage')
  @ApiOperation({ summary: 'Update SMS + email provider settings; applies to future sends (FR-NOTIF-063, §12.12)' })
  @ApiOkResponse({ description: 'Settings updated' })
  @ApiBadRequestResponse({ description: 'Invalid masked_sender_id (>11 chars or non-alphanumeric) / quiet-hours format' })
  @ApiForbiddenResponse({ description: 'Missing notifications.settings.manage' })
  async update(@Body() dto: UpdateSettingsDto): Promise<{ updated: boolean }> {
    return this.settings.updateSettings(dto);
  }
}
