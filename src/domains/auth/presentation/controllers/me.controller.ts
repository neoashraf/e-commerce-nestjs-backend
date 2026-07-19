import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { Customer } from '../../domain/entities/customer.entity';
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import { UpdateProfileUseCase } from '../../application/use-cases/update-profile.use-case';
import { ChangePasswordUseCase } from '../../application/use-cases/change-password.use-case';
import { RequestPasswordSetUseCase } from '../../application/use-cases/request-password-set.use-case';
import { SetPasswordUseCase } from '../../application/use-cases/set-password.use-case';
import { RequestPhoneChangeUseCase } from '../../application/use-cases/request-phone-change.use-case';
import { ConfirmPhoneChangeUseCase } from '../../application/use-cases/confirm-phone-change.use-case';
import { DeleteAccountUseCase } from '../../application/use-cases/delete-account.use-case';
import { JwtCustomerGuard } from '../guards/jwt-customer.guard';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { PasswordSetRequestResponseDto, SetPasswordDto } from '../dto/password-set.dto';
import { ChangePhoneConfirmDto, ChangePhoneRequestDto } from '../dto/change-phone.dto';
import { DeleteAccountDto } from '../dto/delete-account.dto';
import { MessageResponseDto } from '../dto/message-response.dto';
import {
  ChangePhoneConfirmResponseDto,
  ChangePhoneRequestResponseDto,
  MeResponseDto,
  UpdateProfileResponseDto,
} from '../dto/me-response.dto';

@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly getMeUseCase: GetMeUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly requestPasswordSetUseCase: RequestPasswordSetUseCase,
    private readonly setPasswordUseCase: SetPasswordUseCase,
    private readonly requestPhoneChangeUseCase: RequestPhoneChangeUseCase,
    private readonly confirmPhoneChangeUseCase: ConfirmPhoneChangeUseCase,
    private readonly deleteAccountUseCase: DeleteAccountUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated customer profile' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<MeResponseDto> {
    const result = await this.getMeUseCase.execute({ customerId: customer.customerId });
    return MeController.toMeResponse(result);
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile; changing email re-triggers verification' })
  @ApiOkResponse({ type: UpdateProfileResponseDto })
  @ApiConflictResponse({ description: 'Email already in use by another account' })
  @ApiBadRequestResponse({ description: 'Invalid date of birth / under 13' })
  async updateProfile(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: UpdateProfileDto,
  ): Promise<UpdateProfileResponseDto> {
    const { customer: updated, emailChanged } = await this.updateProfileUseCase.execute({
      customerId: customer.customerId,
      fullName: dto.full_name,
      gender: dto.gender,
      dateOfBirth: dto.date_of_birth,
      email: dto.email,
      promoSmsOptIn: dto.promo_sms_opt_in,
      promoEmailOptIn: dto.promo_email_opt_in,
    });
    return {
      id: updated.id,
      email_verified: updated.emailVerified,
      ...(emailChanged && updated.email
        ? { message: `Verification email sent to ${updated.email}` }
        : {}),
    };
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change password (requires current password)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Current password incorrect' })
  @ApiBadRequestResponse({ description: 'New password fails policy' })
  async changePassword(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.changePasswordUseCase.execute({
      customerId: customer.customerId,
      currentPassword: dto.current_password,
      newPassword: dto.new_password,
      currentSessionId: customer.sessionId,
    });
    return { message: 'Password changed. Other devices have been signed out.' };
  }

  @Post('password/set/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start the first-password set flow (passwordless accounts, FR-AUTH-036/037)',
  })
  @ApiOkResponse({ type: PasswordSetRequestResponseDto })
  @ApiConflictResponse({
    description: 'Account already has a password (PASSWORD_EXISTS) or no verified phone (PHONE_REQUIRED)',
  })
  async requestPasswordSet(
    @CurrentCustomer() customer: AuthenticatedCustomer,
  ): Promise<PasswordSetRequestResponseDto> {
    const result = await this.requestPasswordSetUseCase.execute({
      customerId: customer.customerId,
      currentSessionId: customer.sessionId,
    });
    return {
      otp_required: result.otpRequired,
      expires_in: result.expiresIn,
      ...(result.challengeId ? { challenge_id: result.challengeId } : {}),
      ...(result.resendAfter !== undefined ? { resend_after: result.resendAfter } : {}),
      ...(result.setToken ? { set_token: result.setToken } : {}),
      ...(result.devCode ? { dev_otp: result.devCode } : {}),
    };
  }

  @Post('password/set')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create the first password with an OTP code or a set_token' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Weak password, or wrong/expired code or set token' })
  @ApiConflictResponse({ description: 'Account already has a password (PASSWORD_EXISTS)' })
  async setPassword(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: SetPasswordDto,
  ): Promise<MessageResponseDto> {
    await this.setPasswordUseCase.execute({
      customerId: customer.customerId,
      newPassword: dto.new_password,
      challengeId: dto.challenge_id,
      code: dto.code,
      setToken: dto.set_token,
      currentSessionId: customer.sessionId,
    });
    return { message: 'Password created. You can now log in with email + password.' };
  }

  @Post('phone/change/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an OTP to a new phone number' })
  @ApiOkResponse({ type: ChangePhoneRequestResponseDto })
  @ApiConflictResponse({ description: 'New phone already registered to another account' })
  async requestPhoneChange(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ChangePhoneRequestDto,
  ): Promise<ChangePhoneRequestResponseDto> {
    const result = await this.requestPhoneChangeUseCase.execute({
      customerId: customer.customerId,
      newPhone: dto.new_phone,
    });
    return { challenge_id: result.challengeId, expires_in: result.expiresIn };
  }

  @Post('phone/change/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm a phone change with the OTP sent to the new number' })
  @ApiOkResponse({ type: ChangePhoneConfirmResponseDto })
  @ApiConflictResponse({ description: 'New phone already registered to another account' })
  async confirmPhoneChange(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: ChangePhoneConfirmDto,
  ): Promise<ChangePhoneConfirmResponseDto> {
    const result = await this.confirmPhoneChangeUseCase.execute({
      customerId: customer.customerId,
      challengeId: dto.challenge_id,
      code: dto.code,
    });
    return { phone: result.phone, phone_verified: result.phoneVerified };
  }

  @Delete()
  @ApiOperation({ summary: 'Delete (soft-delete + anonymize) the account' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Confirmation required' })
  async deleteAccount(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Body() dto: DeleteAccountDto,
  ): Promise<MessageResponseDto> {
    await this.deleteAccountUseCase.execute({
      customerId: customer.customerId,
      confirm: dto.confirm,
    });
    return { message: 'Account scheduled for deletion. You have been signed out.' };
  }

  private static toMeResponse(c: Customer): MeResponseDto {
    return {
      id: c.id,
      full_name: c.fullName,
      phone: c.phone,
      phone_verified: c.phoneVerified,
      email: c.email,
      email_verified: c.emailVerified,
      gender: c.gender,
      date_of_birth: c.dateOfBirth ? c.dateOfBirth.toISOString().slice(0, 10) : null,
      promo_sms_opt_in: c.promoSmsOptIn,
      promo_email_opt_in: c.promoEmailOptIn,
    };
  }
}
