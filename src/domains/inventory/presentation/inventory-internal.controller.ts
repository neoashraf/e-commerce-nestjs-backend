import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../shared/guards/service-token.guard';
import { AvailabilityEntry, InventoryService } from '../application/inventory.service';
import { BatchAvailabilityDto } from './dto/batch-availability.dto';

/**
 * Internal inventory availability (SRS 11 §5.1; contract: Availability). Consumed service-to-service
 * by CAT/SRCH/CART/WISH; guarded by the shared service token (not a customer/admin JWT). Returns a
 * `{ <variant_id>: { available, status } }` map in one batched query (FR-INV-003/004, no N+1).
 */
@ApiTags('Inventory — Internal')
@ApiSecurity('service-token')
@UseGuards(ServiceTokenGuard)
@Controller('internal/inventory')
export class InventoryInternalController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('availability')
  @ApiOperation({ summary: 'Batched stock availability + status for a set of variant ids' })
  @ApiOkResponse({ description: 'Map of variant_id → { available, status }' })
  async availability(
    @Body() dto: BatchAvailabilityDto,
  ): Promise<Record<string, AvailabilityEntry>> {
    return this.inventory.batchAvailability(dto.variant_ids);
  }
}
