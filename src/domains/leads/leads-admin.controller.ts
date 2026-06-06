import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../rbac/presentation/decorators/current-admin.decorator';
import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { Paginated } from '../../shared/dto/paginated';
import { LeadsAdminService } from './leads-admin.service';
import {
  AdminLeadDetailDto,
  AdminLeadListItemDto,
  AdminReplyDto,
  AdminReplyResultDto,
  AssignLeadDto,
  AssignLeadResultDto,
  ChangeStatusDto,
  ChangeStatusResultDto,
  HandoffExchangeDto,
  HandoffExchangeResultDto,
  InternalNoteDto,
  InternalNoteResultDto,
  ListAdminLeadsQueryDto,
} from './dto/admin-lead.dto';
import { LeadStatus } from './leads.enums';

/**
 * Admin communication inbox (FR-LEAD-010–016; contract: Admin — Inbox). All routes require an admin token
 * and a `leads.lead.*` permission; the claim handoff additionally requires `orders.exchange.review`
 * (enforced in the service). The `{ data }` / `{ data, meta }` envelope is applied globally.
 */
@ApiTags('Leads — Admin Inbox')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly inbox: LeadsAdminService) {}

  @Get()
  @Requires('leads.lead.read')
  @ApiOperation({ summary: 'List/filter the lead inbox (status, type, assignee, date, linked order)' })
  @ApiOkResponse({ type: [AdminLeadListItemDto] })
  list(@Query() query: ListAdminLeadsQueryDto): Promise<Paginated<AdminLeadListItemDto>> {
    return this.inbox.list({
      status: query.status,
      type: query.type,
      assignee: query.assignee,
      order: query.order,
      from: query.from,
      to: query.to,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Get(':reference')
  @Requires('leads.lead.read')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({ summary: 'Lead detail (submitter, links, thread incl. internal notes, attachments)' })
  @ApiOkResponse({ type: AdminLeadDetailDto })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  detail(@Param('reference') reference: string): Promise<AdminLeadDetailDto> {
    return this.inbox.getDetail(reference);
  }

  @Post(':reference/assign')
  @HttpCode(HttpStatus.OK)
  @Requires('leads.lead.assign')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({ summary: 'Assign / reassign a lead to an admin' })
  @ApiOkResponse({ type: AssignLeadResultDto })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  assign(
    @Param('reference') reference: string,
    @Body() dto: AssignLeadDto,
  ): Promise<AssignLeadResultDto> {
    return this.inbox.assign(reference, dto.admin_id);
  }

  @Post(':reference/reply')
  @HttpCode(HttpStatus.CREATED)
  @Requires('leads.lead.respond')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({ summary: 'Reply to a lead (delivered via NOTIF + threaded; undelivered flagged)' })
  @ApiCreatedResponse({ type: AdminReplyResultDto })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  reply(
    @Param('reference') reference: string,
    @Body() dto: AdminReplyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<AdminReplyResultDto> {
    return this.inbox.reply(reference, dto.body, dto.channel, admin.adminId);
  }

  @Post(':reference/notes')
  @HttpCode(HttpStatus.CREATED)
  @Requires('leads.lead.respond')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({ summary: 'Add an internal note (never delivered to the customer)' })
  @ApiCreatedResponse({ type: InternalNoteResultDto })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  addNote(
    @Param('reference') reference: string,
    @Body() dto: InternalNoteDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<InternalNoteResultDto> {
    return this.inbox.addNote(reference, dto.body, admin.adminId);
  }

  @Patch(':reference/status')
  @Requires('leads.lead.respond')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({ summary: 'Change lead status (open | awaiting_customer | resolved | closed | spam)' })
  @ApiOkResponse({ type: ChangeStatusResultDto })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  changeStatus(
    @Param('reference') reference: string,
    @Body() dto: ChangeStatusDto,
  ): Promise<ChangeStatusResultDto> {
    return this.inbox.changeStatus(reference, dto.status as unknown as LeadStatus);
  }

  @Post(':reference/handoff-exchange')
  @HttpCode(HttpStatus.ACCEPTED)
  @Requires('leads.lead.respond')
  @ApiParam({ name: 'reference', example: 'HLP-20451' })
  @ApiOperation({
    summary: 'Hand a claim to Orders — initiate an exchange (post-delivery) or pre-dispatch cancel; no cash refund',
  })
  @ApiAcceptedResponse({ type: HandoffExchangeResultDto })
  @ApiForbiddenResponse({ description: 'Requires orders.exchange.review' })
  @ApiNotFoundResponse({ description: 'LEAD_NOT_FOUND' })
  handoff(
    @Param('reference') reference: string,
    @Body() dto: HandoffExchangeDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<HandoffExchangeResultDto> {
    return this.inbox.handoffExchange(reference, dto, admin);
  }
}
