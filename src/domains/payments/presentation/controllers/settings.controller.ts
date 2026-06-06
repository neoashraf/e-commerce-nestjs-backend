import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { PaymentMethod } from '../../domain/payment-enums';
import {
  GatewaySettingsUpdate,
  SettingsService,
} from '../../application/services/settings.service';
import {
  GatewaySettingsResponseDto,
  UpdateGatewaySettingsDto,
} from '../dto/settings.dto';

/**
 * Gateway settings (FR-PAY-060/061; contract: Admin — Gateway Settings). Gated by
 * `payments.settings.manage`. `GET` returns per-method environment + `credentials_ref` + enable flag,
 * **never** the raw secret (BR-PAY-7). `PUT` upserts; a disabled method then rejects initiation.
 */
@ApiTags('Payments — Settings')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/payment-settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Requires('payments.settings.manage')
  @ApiOperation({ summary: 'Get gateway settings (no raw secrets — credentials_ref only)' })
  @ApiOkResponse({ type: GatewaySettingsResponseDto })
  get() {
    return this.settings.getAll();
  }

  @Put()
  @Requires('payments.settings.manage')
  @ApiOperation({ summary: 'Update gateway settings (enable/environment/credentials_ref per method)' })
  @ApiOkResponse({ description: '{ updated: true }' })
  async update(@Body() dto: UpdateGatewaySettingsDto): Promise<{ updated: boolean }> {
    const updates: Partial<Record<PaymentMethod, GatewaySettingsUpdate>> = {};
    if (dto.bkash) updates[PaymentMethod.BKASH] = dto.bkash;
    if (dto.sslcommerz) updates[PaymentMethod.SSLCOMMERZ] = dto.sslcommerz;
    if (dto.cod) updates[PaymentMethod.COD] = dto.cod;
    await this.settings.update(updates);
    return { updated: true };
  }
}
