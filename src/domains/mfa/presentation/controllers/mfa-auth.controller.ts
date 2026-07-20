import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ResendSecondFactorUseCase } from '../../application/use-cases/resend-second-factor.use-case';
import { SwitchChannelUseCase } from '../../application/use-cases/switch-channel.use-case';
import { VerifySecondFactorUseCase } from '../../application/use-cases/verify-second-factor.use-case';
import { ResendMfaDto, SwitchMfaChannelDto, VerifyMfaDto } from '../dto/mfa-auth.dto';
import {
  MfaChallengeResponseDto,
  MfaVerifyResponseDto,
} from '../dto/mfa-response.dto';

/**
 * Login second-factor endpoints (FR-MFA-013–022). Public — authorized mid-login by the short-lived
 * pre-auth token (from POST /auth/login), NOT by a session.
 */
@ApiTags('Auth — MFA')
@Controller('auth/mfa')
export class MfaAuthController {
  constructor(
    private readonly verify: VerifySecondFactorUseCase,
    private readonly resend: ResendSecondFactorUseCase,
    private readonly switchChannel: SwitchChannelUseCase,
  ) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submit the second-factor code and complete login (FR-MFA-013)' })
  @ApiOkResponse({ type: MfaVerifyResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_CODE | CODE_EXPIRED' })
  @ApiUnauthorizedResponse({ description: 'PRE_AUTH_INVALID' })
  async verifyCode(@Body() dto: VerifyMfaDto): Promise<MfaVerifyResponseDto> {
    const result = await this.verify.execute({
      preAuthToken: dto.pre_auth_token,
      code: dto.code,
    });
    return {
      customer: { id: result.customer.id },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend the second-factor code (FR-MFA-016)' })
  @ApiOkResponse({ type: MfaChallengeResponseDto })
  @ApiUnauthorizedResponse({ description: 'PRE_AUTH_INVALID' })
  @ApiTooManyRequestsResponse({ description: 'MFA_COOLDOWN | MFA_HOURLY_CAP' })
  async resendCode(@Body() dto: ResendMfaDto): Promise<MfaChallengeResponseDto> {
    const challenge = await this.resend.execute({ preAuthToken: dto.pre_auth_token });
    return {
      challenge: {
        id: challenge.id,
        channel: challenge.channel,
        sent_to: challenge.sentTo,
        expires_in: challenge.expiresIn,
        resend_after: challenge.resendAfter,
      },
    };
  }

  @Post('channel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Switch the delivery channel and resend (FR-MFA-020)' })
  @ApiOkResponse({ type: MfaChallengeResponseDto })
  @ApiBadRequestResponse({ description: 'CHANNEL_NOT_AVAILABLE' })
  @ApiUnauthorizedResponse({ description: 'PRE_AUTH_INVALID' })
  async switchDeliveryChannel(@Body() dto: SwitchMfaChannelDto): Promise<MfaChallengeResponseDto> {
    const challenge = await this.switchChannel.execute({
      preAuthToken: dto.pre_auth_token,
      channel: dto.channel,
      remember: dto.remember,
    });
    return {
      challenge: {
        id: challenge.id,
        channel: challenge.channel,
        sent_to: challenge.sentTo,
        expires_in: challenge.expiresIn,
        resend_after: challenge.resendAfter,
      },
    };
  }
}
