import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ServiceTokenGuard } from '../../../../shared/guards/service-token.guard';
import { CreateLightweightAccountUseCase } from '../../application/use-cases/create-lightweight-account.use-case';
import { CreateLightweightDto } from '../dto/create-lightweight.dto';
import { LightweightAccountResponseDto } from '../dto/lightweight-response.dto';

/**
 * Internal AUTH endpoints for service-to-service calls (service-token auth, not a
 * customer/admin JWT). Consumed by CART checkout placement (FR-AUTH-070/072).
 */
@ApiTags('Auth (internal)')
@ApiSecurity('service-token')
@Controller('internal/customers')
@UseGuards(ServiceTokenGuard)
export class InternalCustomersController {
  constructor(
    private readonly createLightweightAccount: CreateLightweightAccountUseCase,
  ) {}

  @Post('lightweight')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Internal: auto-create (or reuse) a lightweight account by phone' })
  @ApiOkResponse({ type: LightweightAccountResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid name or BD mobile number' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid service token' })
  async createLightweight(
    @Body() dto: CreateLightweightDto,
  ): Promise<LightweightAccountResponseDto> {
    const result = await this.createLightweightAccount.execute({
      fullName: dto.full_name,
      phone: dto.phone,
      email: dto.email ?? null,
      promoSmsOptIn: dto.promo_sms_opt_in,
      promoEmailOptIn: dto.promo_email_opt_in,
    });
    return {
      customer_id: result.customerId,
      was_existing: result.wasExisting,
      is_lightweight: result.isLightweight,
    };
  }
}
