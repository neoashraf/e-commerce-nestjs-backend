import { Body, Controller, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { OverrideAreaZoneUseCase } from '../../application/use-cases/override-area-zone.use-case';
import { AdminGeoAreaDto, AdminGeoAreaResponseDto } from '../dto/geo-response.dto';
import { OverrideAreaZoneDto } from '../dto/override-area-zone.dto';

/**
 * Admin geo overrides (SRS 04 §5.6, FR-CART-047). Reclassify any area's delivery zone without a
 * code change; resolution reflects it immediately. Gated by `cart.settings.manage` (AC5).
 */
@ApiTags('Cart — Geography (Admin)')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/geo')
export class AdminGeoController {
  constructor(private readonly overrideZone: OverrideAreaZoneUseCase) {}

  @Patch('areas/:id')
  @Requires('cart.settings.manage')
  @ApiOperation({ summary: "Override an area's delivery zone (FR-CART-047)" })
  @ApiOkResponse({ type: AdminGeoAreaResponseDto })
  @ApiNotFoundResponse({ description: 'GEO_AREA_NOT_FOUND' })
  async override(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OverrideAreaZoneDto,
  ): Promise<AdminGeoAreaDto> {
    const area = await this.overrideZone.execute(id, dto.delivery_zone);
    return {
      id: area.id,
      division: area.division,
      district: area.district,
      upazila: area.upazila,
      delivery_zone: area.deliveryZone,
      postal_code: area.postalCode,
      is_active: area.isActive,
    };
  }
}
