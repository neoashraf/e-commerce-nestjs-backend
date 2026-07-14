import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { JwtCustomerGuard } from '../../../auth/presentation/guards/jwt-customer.guard';
import { ConfirmEnableUseCase } from '../../application/use-cases/confirm-enable.use-case';
import { DisableMfaUseCase } from '../../application/use-cases/disable-mfa.use-case';
import { EnableMfaUseCase } from '../../application/use-cases/enable-mfa.use-case';
import { GetMyMfaUseCase } from '../../application/use-cases/get-my-mfa.use-case';
import { SetPreferredChannelUseCase } from '../../application/use-cases/set-preferred-channel.use-case';
import {
  ConfirmEnableMfaDto,
  DisableMfaDto,
  EnableMfaDto,
  SetPreferredChannelDto,
} from '../dto/me-mfa.dto';
import {
  ConfirmEnableResponseDto,
  DisableMfaResponseDto,
  EnableMfaResponseDto,
  MyMfaResponseDto,
  PreferredChannelResponseDto,
} from '../dto/mfa-response.dto';

/** Customer self-service 2FA settings (FR-MFA-001–003, 035). Requires a customer access token. */
@ApiTags('Me — MFA')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me/mfa')
export class MeMfaController {
  constructor(
    private readonly getMyMfa: GetMyMfaUseCase,
    private readonly enable: EnableMfaUseCase,
    private readonly confirmEnable: ConfirmEnableUseCase,
    private readonly disable: DisableMfaUseCase,
    private readonly setPreferred: SetPreferredChannelUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My 2FA status + effective policy (FR-MFA-035)' })
  @ApiOkResponse({ type: MyMfaResponseDto })
  async status(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<MyMfaResponseDto> {
    const result = await this.getMyMfa.execute({ customerId: customer.customerId });
    return {
      enabled: result.enabled,
      preferred_channel: result.preferredChannel,
      policy: {
        enforcement_mode: result.policy.enforcementMode,
        available_channels: result.policy.availableChannels,
      },
      eligible_channels: result.eligibleChannels,
    };
  }

  @Post('enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start enabling 2FA — sends a confirmation code (FR-MFA-001)' })
  @ApiOkResponse({ type: EnableMfaResponseDto })
  @ApiBadRequestResponse({ description: 'NO_ELIGIBLE_CHANNEL | CHANNEL_NOT_AVAILABLE | MFA_PASSWORD_REQUIRED' })
  async enableMfa(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: EnableMfaDto,
  ): Promise<EnableMfaResponseDto> {
    const challenge = await this.enable.execute({
      customerId: customer.customerId,
      preferredChannel: dto.preferred_channel,
    });
    return {
      verification: {
        challenge_id: challenge.id,
        channel: challenge.channel,
        sent_to: challenge.sentTo,
        expires_in: challenge.expiresIn,
      },
    };
  }

  @Post('enable/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the enable code and activate 2FA (FR-MFA-001)' })
  @ApiOkResponse({ type: ConfirmEnableResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_CODE | CODE_EXPIRED' })
  async confirm(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ConfirmEnableMfaDto,
  ): Promise<ConfirmEnableResponseDto> {
    const result = await this.confirmEnable.execute({
      customerId: customer.customerId,
      challengeId: dto.challenge_id,
      code: dto.code,
    });
    return {
      enabled: result.enabled,
      preferred_channel: result.preferredChannel,
      enabled_at: result.enabledAt.toISOString(),
    };
  }

  @Post('disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable 2FA (requires current password) (FR-MFA-002)' })
  @ApiOkResponse({ type: DisableMfaResponseDto })
  @ApiUnauthorizedResponse({ description: 'INVALID_PASSWORD' })
  @ApiBadRequestResponse({ description: 'MFA_NOT_ENABLED' })
  async disableMfa(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: DisableMfaDto,
  ): Promise<DisableMfaResponseDto> {
    const result = await this.disable.execute({
      customerId: customer.customerId,
      currentPassword: dto.current_password,
    });
    return { enabled: result.enabled };
  }

  @Patch('preferred-channel')
  @ApiOperation({ summary: 'Change the preferred delivery channel (FR-MFA-003)' })
  @ApiOkResponse({ type: PreferredChannelResponseDto })
  @ApiBadRequestResponse({ description: 'CHANNEL_NOT_AVAILABLE' })
  async preferredChannel(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: SetPreferredChannelDto,
  ): Promise<PreferredChannelResponseDto> {
    const result = await this.setPreferred.execute({
      customerId: customer.customerId,
      channel: dto.preferred_channel,
    });
    return { preferred_channel: result.preferredChannel };
  }
}
