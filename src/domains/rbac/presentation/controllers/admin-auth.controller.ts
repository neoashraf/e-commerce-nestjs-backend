import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiGoneResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AdminLoginUseCase } from '../../application/use-cases/admin-login.use-case';
import { Verify2faUseCase } from '../../application/use-cases/verify-2fa.use-case';
import { RefreshAdminTokenUseCase } from '../../application/use-cases/refresh-admin-token.use-case';
import { AdminLogoutUseCase } from '../../application/use-cases/admin-logout.use-case';
import { ForgotPasswordUseCase } from '../../application/use-cases/forgot-password.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { Verify2faDto } from '../dto/verify-2fa.dto';
import { AdminRefreshTokenDto } from '../dto/admin-refresh-token.dto';
import { AdminLogoutDto } from '../dto/admin-logout.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import {
  AdminLoginResponseDto,
  AdminRefreshResponseDto,
  AdminVerify2faResponseDto,
} from '../dto/admin-auth-response.dto';

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminLogin: AdminLoginUseCase,
    private readonly verify2fa: Verify2faUseCase,
    private readonly refreshToken: RefreshAdminTokenUseCase,
    private readonly logoutUseCase: AdminLogoutUseCase,
    private readonly forgotPassword: ForgotPasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin login (email + password); may require a 2FA second factor' })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: AdminLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminLoginResponseDto> {
    const result = await this.adminLogin.execute({
      email: dto.email,
      password: dto.password,
      rememberDevice: dto.remember_device ?? false,
      ipAddress: ip ?? null,
      deviceLabel: userAgent ?? null,
    });
    if (result.twofaRequired) {
      return {
        twofa_required: true,
        challenge_id: result.challengeId,
        channel: result.channel,
        expires_in: result.expiresIn,
      };
    }
    return {
      admin: { id: result.admin.id, full_name: result.admin.fullName, role: result.admin.roleName },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Complete login by verifying the 2FA code' })
  @ApiOkResponse({ type: AdminVerify2faResponseDto })
  @ApiBadRequestResponse({ description: 'Wrong or expired code' })
  async verify(
    @Body() dto: Verify2faDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminVerify2faResponseDto> {
    const result = await this.verify2fa.execute({
      challengeId: dto.challenge_id,
      code: dto.code,
      ipAddress: ip ?? null,
      deviceLabel: userAgent ?? null,
    });
    return {
      admin: { id: result.admin.id, role: result.admin.roleName },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the admin refresh token and issue a new access token' })
  @ApiOkResponse({ type: AdminRefreshResponseDto })
  @ApiUnauthorizedResponse({ description: 'Expired/revoked/non-admin token' })
  async refresh(
    @Body() dto: AdminRefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AdminRefreshResponseDto> {
    const result = await this.refreshToken.execute({
      refreshToken: dto.refresh_token,
      deviceLabel: userAgent ?? null,
    });
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current admin session' })
  async logout(@Body() dto: AdminLogoutDto): Promise<void> {
    await this.logoutUseCase.execute({ refreshToken: dto.refresh_token });
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request an admin password-reset link (generic success, no enumeration)' })
  @ApiOkResponse({ description: 'Generic success' })
  async forgot(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.forgotPassword.execute({ email: dto.email });
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset the admin password from a token; revokes all sessions' })
  @ApiOkResponse({ description: 'Password updated' })
  @ApiBadRequestResponse({ description: 'Weak password' })
  @ApiGoneResponse({ description: 'Token expired or already used' })
  async reset(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.resetPasswordUseCase.execute({ token: dto.token, newPassword: dto.new_password });
  }
}
