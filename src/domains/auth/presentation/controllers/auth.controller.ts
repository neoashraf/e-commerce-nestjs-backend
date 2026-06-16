import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { OtpPurpose } from '../../domain/enums/otp-purpose.enum';
import { RequestOtpUseCase } from '../../application/use-cases/request-otp.use-case';
import { VerifyOtpUseCase } from '../../application/use-cases/verify-otp.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RegisterWithEmailUseCase } from '../../application/use-cases/register-with-email.use-case';
import { LoginWithEmailUseCase } from '../../application/use-cases/login-with-email.use-case';
import { VerifyEmailUseCase } from '../../application/use-cases/verify-email.use-case';
import { IssueEmailVerificationUseCase } from '../../application/use-cases/issue-email-verification.use-case';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../application/use-cases/reset-password.use-case';
import { ClaimAccountUseCase } from '../../application/use-cases/claim-account.use-case';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { LogoutDto } from '../dto/logout.dto';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { MessageResponseDto } from '../dto/message-response.dto';
import { ClaimAccountDto } from '../dto/claim.dto';
import { JwtCustomerGuard } from '../guards/jwt-customer.guard';
import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import {
  ClaimResponseDto,
  LoginResponseDto,
  OtpRequestResponseDto,
  RefreshResponseDto,
  RegisterResponseDto,
  VerifyEmailResponseDto,
  VerifyOtpResponseDto,
} from '../dto/auth-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly requestOtpUseCase: RequestOtpUseCase,
    private readonly verifyOtpUseCase: VerifyOtpUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly registerWithEmailUseCase: RegisterWithEmailUseCase,
    private readonly loginWithEmailUseCase: LoginWithEmailUseCase,
    private readonly verifyEmailUseCase: VerifyEmailUseCase,
    private readonly issueEmailVerificationUseCase: IssueEmailVerificationUseCase,
    private readonly getMeUseCase: GetMeUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly claimAccountUseCase: ClaimAccountUseCase,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request an OTP for phone login/registration' })
  @ApiOkResponse({ type: OtpRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid BD mobile number' })
  @ApiTooManyRequestsResponse({ description: 'Resend cooldown or hourly cap exceeded' })
  async requestOtp(@Body() dto: RequestOtpDto): Promise<OtpRequestResponseDto> {
    const result = await this.requestOtpUseCase.execute({
      phone: dto.phone,
      purpose:
        dto.purpose === 'register'
          ? OtpPurpose.REGISTER
          : dto.purpose === 'password_reset'
            ? OtpPurpose.PASSWORD_RESET
            : OtpPurpose.LOGIN,
    });
    return {
      challenge_id: result.challengeId,
      expires_in: result.expiresIn,
      resend_after: result.resendAfter,
    };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verify an OTP — registers a new phone or logs in an existing one' })
  @ApiOkResponse({ type: VerifyOtpResponseDto })
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<VerifyOtpResponseDto> {
    const result = await this.verifyOtpUseCase.execute({
      challengeId: dto.challenge_id,
      code: dto.code,
      fullName: dto.full_name,
    });
    return {
      is_new_account: result.isNewAccount,
      customer: {
        id: result.customer.id,
        full_name: result.customer.fullName,
        phone: result.customer.phone,
        phone_verified: result.customer.phoneVerified,
      },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register with email + password; sends a verification email' })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiBadRequestResponse({ description: 'Weak password or invalid email' })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    const result = await this.registerWithEmailUseCase.execute({
      fullName: dto.full_name,
      email: dto.email,
      password: dto.password,
      promoEmailOptIn: dto.promo_email_opt_in,
    });
    return {
      customer: {
        id: result.customer.id,
        email: result.customer.email,
        email_verified: result.customer.emailVerified,
      },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Log in with email + password' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    const result = await this.loginWithEmailUseCase.execute({
      email: dto.email,
      password: dto.password,
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

  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Confirm an email-verification link' })
  @ApiOkResponse({ type: VerifyEmailResponseDto })
  @ApiGoneResponse({ description: 'Verification link expired or already used' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<VerifyEmailResponseDto> {
    const result = await this.verifyEmailUseCase.execute({ token: dto.token });
    return { email_verified: result.emailVerified };
  }

  @Post('email/verify/resend')
  @UseGuards(JwtCustomerGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resend the email-verification link to the signed-in customer (FR-AUTH-043)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not signed in' })
  @ApiBadRequestResponse({ description: 'No email on the account' })
  @ApiTooManyRequestsResponse({ description: 'Resend cooldown active' })
  async resendEmailVerification(
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<MessageResponseDto> {
    const me = await this.getMeUseCase.execute({ customerId: customer.customerId });
    if (!me.email) {
      throw new BadRequestException({
        code: 'NO_EMAIL',
        message: 'Add an email to your profile before requesting verification.',
      });
    }
    if (me.emailVerified) {
      return { message: 'Your email is already verified.' };
    }
    await this.issueEmailVerificationUseCase.execute({
      customerId: customer.customerId,
      email: me.email,
      fullName: me.fullName,
      enforceCooldown: true,
    });
    return { message: `Verification email sent to ${me.email}.` };
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password-reset email (always returns 200)' })
  @ApiOkResponse({ type: MessageResponseDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    await this.requestPasswordResetUseCase.execute({ email: dto.email });
    // Generic response regardless of whether the email exists (anti-enumeration, FR-AUTH-033).
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Reset password with a token; revokes all sessions' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Weak password' })
  @ApiGoneResponse({ description: 'Reset token expired or already used' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    await this.resetPasswordUseCase.execute({
      token: dto.token,
      challengeId: dto.challenge_id,
      code: dto.code,
      newPassword: dto.new_password,
    });
    return { message: 'Password updated. All sessions have been signed out.' };
  }

  @Post('account/claim')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Claim/activate a lightweight account via OTP (optionally set a password)' })
  @ApiOkResponse({ type: ClaimResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid/expired OTP or weak password' })
  @ApiConflictResponse({ description: 'Phone already belongs to a full account' })
  async claimAccount(@Body() dto: ClaimAccountDto): Promise<ClaimResponseDto> {
    const result = await this.claimAccountUseCase.execute({
      challengeId: dto.challenge_id,
      code: dto.code,
      password: dto.password,
    });
    return {
      customer: {
        id: result.customer.id,
        is_lightweight: result.customer.isLightweight,
        phone_verified: result.customer.phoneVerified,
      },
      tokens: {
        access_token: result.tokens.accessToken,
        refresh_token: result.tokens.refreshToken,
        expires_in: result.tokens.expiresIn,
      },
    };
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ type: RefreshResponseDto })
  async refresh(@Body() dto: RefreshTokenDto): Promise<RefreshResponseDto> {
    const result = await this.refreshTokenUseCase.execute({ refreshToken: dto.refresh_token });
    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke the current session (refresh token)' })
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.logoutUseCase.execute({ refreshToken: dto.refresh_token });
  }
}
