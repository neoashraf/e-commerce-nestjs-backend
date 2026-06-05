import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../../shared/dto/paginated';
import { StockMovementActorType } from '../domain/stock-movement-type';
import { JwtAdminGuard } from '../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../rbac/presentation/decorators/requires.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../rbac/presentation/decorators/current-admin.decorator';
import { InventoryRow, InventoryService, StockMutationResult } from '../application/inventory.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { InventoryRowDto, StockMutationResponseDto } from './dto/inventory-response.dto';
import { ListInventoryQueryDto } from './dto/list-inventory-query.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';

/**
 * Admin inventory — levels, receiving & adjustments (SRS 11 §5.1/§5.2; contract: Admin — Levels,
 * Receiving & Adjustments). Reads need `inventory.stock.read`; mutations need the seeded
 * `inventory.stock.update` (the contract names it `inventory.stock.adjust` — using the seeded code;
 * see the PR note).
 */
@ApiTags('Inventory — Admin')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @Requires('inventory.stock.read')
  @ApiOperation({ summary: 'List inventory (paginated; filter by derived status; search sku/title)' })
  @ApiOkResponse({ type: InventoryRowDto, isArray: true })
  async list(@Query() query: ListInventoryQueryDto): Promise<Paginated<InventoryRow>> {
    return this.inventory.list({
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      status: query.status,
      q: query.q,
    });
  }

  @Post(':variantId/receive')
  @Requires('inventory.stock.update')
  @ApiOperation({ summary: 'Receive stock (add quantity with a reason)' })
  @ApiOkResponse({ type: StockMutationResponseDto })
  @ApiBadRequestResponse({ description: 'quantity ≤ 0 or reason missing' })
  @ApiNotFoundResponse({ description: 'No inventory record for the variant' })
  async receive(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: ReceiveStockDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StockMutationResult> {
    return this.inventory.receive(variantId, dto.quantity, dto.reason, {
      type: StockMovementActorType.ADMIN,
      id: admin.adminId,
    });
  }

  @Post(':variantId/adjust')
  @Requires('inventory.stock.update')
  @ApiOperation({ summary: 'Adjust stock by a signed delta (rejects a negative on-hand result)' })
  @ApiOkResponse({ type: StockMutationResponseDto })
  @ApiBadRequestResponse({ description: 'reason missing or quantity_delta == 0' })
  @ApiConflictResponse({ description: 'NEGATIVE_ON_HAND' })
  @ApiNotFoundResponse({ description: 'No inventory record for the variant' })
  async adjust(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: AdjustStockDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<StockMutationResult> {
    return this.inventory.adjust(variantId, dto.quantity_delta, dto.reason, {
      type: StockMovementActorType.ADMIN,
      id: admin.adminId,
    });
  }

  @Patch(':variantId/threshold')
  @Requires('inventory.stock.update')
  @ApiOperation({ summary: 'Set the low-stock threshold (status may flip immediately)' })
  @ApiOkResponse({ type: StockMutationResponseDto })
  @ApiBadRequestResponse({ description: 'low_stock_threshold < 0' })
  @ApiNotFoundResponse({ description: 'No inventory record for the variant' })
  async setThreshold(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: SetThresholdDto,
  ): Promise<StockMutationResult> {
    return this.inventory.setThreshold(variantId, dto.low_stock_threshold);
  }
}
