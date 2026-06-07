import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../../shared/dto/paginated';
import { JwtAdminGuard } from '../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../rbac/presentation/decorators/requires.decorator';
import { MovementRow, MovementService } from '../application/movement.service';
import { ListMovementsQueryDto } from './dto/list-movements.dto';
import { MovementRowDto } from './dto/movement-response.dto';

/**
 * Admin stock movement ledger — read-only history (SRS 11 §5.6; contract: Admin — Movement Ledger,
 * FR-INV-051). There are intentionally no write/update/delete routes here: the ledger is append-only
 * (FR-INV-052) and is written only via `MovementService.recordMovement` from the stock paths. Read is
 * gated by `inventory.stock.read`.
 */
@ApiTags('Inventory — Movement Ledger')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/inventory')
export class MovementsController {
  constructor(private readonly movements: MovementService) {}

  @Get(':variantId/movements')
  @Requires('inventory.stock.read')
  @ApiOperation({
    summary: 'List a SKU’s movement history (paginated; filter by type + date range; newest-first)',
  })
  @ApiParam({ name: 'variantId', description: 'Variant (SKU) id' })
  @ApiOkResponse({ type: MovementRowDto, isArray: true })
  async list(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Query() query: ListMovementsQueryDto,
  ): Promise<Paginated<MovementRow>> {
    return this.movements.listForVariant(variantId, {
      page: query.page ?? 1,
      limit: query.limit ?? 50,
      type: query.type,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
  }
}
