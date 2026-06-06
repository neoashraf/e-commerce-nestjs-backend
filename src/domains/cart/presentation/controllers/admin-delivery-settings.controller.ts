import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { DeliverySettingsService } from '../../application/checkout/delivery-settings.service';
import { UpdateDeliverySettingsDto } from '../dto/checkout.dto';

/**
 * Admin delivery settings (FR-CART-040–043; contract: Admin — Delivery Settings). Per-zone delivery
 * charge + COD surcharge + free-shipping threshold + COD-enabled flag, read by the checkout quote.
 * Gated by `cart.settings.manage`. Seeded with the BD defaults; `400` on a negative charge or an
 * out-of-range COD percentage.
 */
@ApiTags('Cart — Delivery Settings')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/delivery-settings')
export class AdminDeliverySettingsController {
  constructor(private readonly settings: DeliverySettingsService) {}

  @Get()
  @Requires('cart.settings.manage')
  @ApiOperation({ summary: 'Get per-zone delivery charges + COD/free-shipping config' })
  @ApiOkResponse({ description: '{ zones: [...] }' })
  async get(): Promise<{ zones: unknown[] }> {
    return { zones: await this.settings.getAll() };
  }

  @Put()
  @Requires('cart.settings.manage')
  @ApiOperation({ summary: 'Update per-zone delivery charges + COD/free-shipping config' })
  @ApiOkResponse({ description: '{ updated: true }' })
  @ApiBadRequestResponse({ description: 'INVALID_CHARGE' })
  async update(@Body() dto: UpdateDeliverySettingsDto): Promise<{ updated: boolean }> {
    await this.settings.update(
      dto.zones.map((z) => ({ ...z, free_shipping_threshold: z.free_shipping_threshold ?? null })),
    );
    return { updated: true };
  }
}
