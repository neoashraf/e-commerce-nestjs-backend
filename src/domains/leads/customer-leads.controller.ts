import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtCustomerGuard } from '../auth/presentation/guards/jwt-customer.guard';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../shared/decorators/current-customer.decorator';
import { LeadsService } from './leads.service';
import { CustomerReplyDto } from './dto/reply.dto';
import { ListMyLeadsQueryDto } from './dto/list-leads-query.dto';
import {
  CustomerReplyResultDto,
  MyLeadListItemDto,
  MyLeadThreadDto,
} from './dto/lead-responses';
import { Paginated } from '../../shared/dto/paginated';

/**
 * Customer "My Enquiries" (FR-LEAD-020, 021; contract: Customer — My Enquiries). All routes require a
 * customer token and are scoped to the caller's own leads; internal notes are never returned (BR-LEAD-7).
 * A customer reply reopens the lead to `open` (§12.6).
 */
@ApiTags('Leads — My Enquiries')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing/invalid customer token' })
@UseGuards(JwtCustomerGuard)
@Controller('me/leads')
export class CustomerLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List my enquiries (paginated, most-recent-first)' })
  @ApiOkResponse({ type: [MyLeadListItemDto] })
  list(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Query() query: ListMyLeadsQueryDto,
  ): Promise<Paginated<MyLeadListItemDto>> {
    return this.leads.listMyLeads(customer.customerId, query.page ?? 1, query.limit ?? 20);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'View one of my enquiries (thread; internal notes excluded)' })
  @ApiOkResponse({ type: MyLeadThreadDto })
  @ApiNotFoundResponse({ description: 'Enquiry not found for this customer' })
  thread(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('reference') reference: string,
  ): Promise<MyLeadThreadDto> {
    return this.leads.getMyThread(customer.customerId, reference);
  }

  @Post(':reference/reply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to my enquiry (reopens it to "open")' })
  @ApiCreatedResponse({ type: CustomerReplyResultDto })
  @ApiNotFoundResponse({ description: 'Enquiry not found for this customer' })
  reply(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('reference') reference: string,
    @Body() dto: CustomerReplyDto,
  ): Promise<CustomerReplyResultDto> {
    return this.leads.replyToMyLead(customer.customerId, reference, dto.body);
  }
}
