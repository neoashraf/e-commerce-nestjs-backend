import {
  Body,
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
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Paginated } from '../../../../shared/dto/paginated';
import { ExchangeService } from '../../application/services/exchange.service';
import {
  ExchangeDecisionDto,
  ExchangeDecisionResultDto,
  ExchangeDetailDto,
  ExchangeQueueItemDto,
  IssueReplacementDto,
  IssueReplacementResultDto,
  ListExchangesQueryDto,
} from '../dto/exchange.dto';

/**
 * Admin exchange management (FR-ORD-047/048/049; contract: Admin — Management). Review the exchange
 * queue, inspect a request + its evidence, approve/reject (QA passed for defects), and issue the
 * replacement (difference paid first for higher value; restock/scrap the return). Gated by
 * `orders.exchange.*`.
 */
@ApiTags('Orders — Exchanges (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/exchanges')
export class ExchangeAdminController {
  constructor(private readonly exchanges: ExchangeService) {}

  @Get()
  @Requires('orders.exchange.read')
  @ApiOperation({ summary: 'List/filter the exchange queue' })
  @ApiOkResponse({ type: [ExchangeQueueItemDto] })
  async list(@Query() query: ListExchangesQueryDto): Promise<Paginated<ExchangeQueueItemDto>> {
    const result = await this.exchanges.listQueue({
      status: query.status,
      reason: query.reason,
      page: query.page,
      limit: query.limit,
    });
    return new Paginated(result.items, {
      page: result.page,
      limit: result.limit,
      total: result.total,
    });
  }

  @Get(':exchangeId')
  @Requires('orders.exchange.read')
  @ApiParam({ name: 'exchangeId', example: 'ex_1' })
  @ApiOperation({ summary: 'Exchange detail (incl. evidence + QA due)' })
  @ApiOkResponse({ type: ExchangeDetailDto })
  @ApiNotFoundResponse({ description: 'EXCHANGE_NOT_FOUND' })
  detail(
    @Param('exchangeId', ParseUUIDPipe) exchangeId: string,
  ): Promise<ExchangeDetailDto> {
    return this.exchanges.getAdminDetail(exchangeId);
  }

  @Post(':exchangeId/decision')
  @HttpCode(HttpStatus.OK)
  @Requires('orders.exchange.review')
  @ApiParam({ name: 'exchangeId', example: 'ex_1' })
  @ApiOperation({ summary: 'Approve or reject an exchange (QA passed for defects)' })
  @ApiOkResponse({ type: ExchangeDecisionResultDto })
  @ApiConflictResponse({ description: 'EXCHANGE_NOT_PENDING' })
  @ApiNotFoundResponse({ description: 'EXCHANGE_NOT_FOUND' })
  decide(
    @Param('exchangeId', ParseUUIDPipe) exchangeId: string,
    @Body() dto: ExchangeDecisionDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<ExchangeDecisionResultDto> {
    return this.exchanges.decide(
      exchangeId,
      admin.adminId,
      dto.decision,
      dto.rejection_reason ?? null,
    );
  }

  @Post(':exchangeId/issue')
  @HttpCode(HttpStatus.OK)
  @Requires('orders.exchange.review')
  @ApiParam({ name: 'exchangeId', example: 'ex_1' })
  @ApiOperation({ summary: 'Issue the replacement order (difference paid first; restock/scrap return)' })
  @ApiOkResponse({ type: IssueReplacementResultDto })
  @ApiConflictResponse({
    description: 'EXCHANGE_NOT_APPROVED | REPLACEMENT_LOWER_VALUE | DIFFERENCE_UNPAID | REPLACEMENT_OUT_OF_STOCK',
  })
  @ApiNotFoundResponse({ description: 'EXCHANGE_NOT_FOUND | VARIANT_NOT_FOUND' })
  issue(
    @Param('exchangeId', ParseUUIDPipe) exchangeId: string,
    @Body() dto: IssueReplacementDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<IssueReplacementResultDto> {
    return this.exchanges.issue(exchangeId, admin.adminId, {
      replacementVariantId: dto.replacement_variant_id,
      disposition: dto.returned_item_disposition,
    });
  }
}
