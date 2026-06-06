import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { CampaignService } from './campaign.service';
import {
  CampaignDryRunDto,
  CampaignSendDto,
  CampaignSendResultDto,
  CampaignSummaryDto,
} from './dto/campaign.dto';

/**
 * Marketing Manager promotional campaign trigger + eligibility dry-run (NOTIF, SRS 09 §7.3).
 * `promo.campaign` is fanned over the recipient set through the dispatch core (opt-in / bn / quiet
 * hours / rate limit enforced per recipient); the dry-run previews reach before sending.
 */
@ApiTags('Notifications — Campaigns')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/notifications/campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Post('dry-run')
  @Requires('notifications.campaign.send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dry-run a campaign — eligible/suppressed/blocked counts + estimated segments' })
  @ApiOkResponse({ type: CampaignSummaryDto })
  async dryRun(@Body() dto: CampaignDryRunDto): Promise<CampaignSummaryDto> {
    return this.campaigns.dryRun(dto);
  }

  @Post()
  @Requires('notifications.campaign.send')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a promotional campaign to a recipient set (idempotent per recipient)' })
  @ApiCreatedResponse({ type: CampaignSendResultDto })
  @ApiUnprocessableEntityResponse({ description: 'Promotional SMS requires a bn template (NO_BANGLA_TEMPLATE)' })
  async send(@Body() dto: CampaignSendDto): Promise<CampaignSendResultDto> {
    return this.campaigns.send(dto);
  }
}
