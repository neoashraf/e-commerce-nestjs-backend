import { Body, Controller, Get, HttpCode, HttpStatus, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { GetAdminMeUseCase } from '../../application/use-cases/get-admin-me.use-case';
import { UpdateAdminProfileUseCase } from '../../application/use-cases/update-admin-profile.use-case';
import { ChangeAdminPasswordUseCase } from '../../application/use-cases/change-admin-password.use-case';
import { UpdateAdmin2faUseCase } from '../../application/use-cases/update-admin-2fa.use-case';
import { ConfirmAdmin2faUseCase } from '../../application/use-cases/confirm-admin-2fa.use-case';
import { AdminMeResponseDto } from '../dto/admin-me-response.dto';
import { UpdateAdminMeDto } from '../dto/update-admin-me.dto';
import { ChangeAdminPasswordDto } from '../dto/change-admin-password.dto';
import { ConfirmAdmin2faDto, UpdateAdmin2faDto } from '../dto/update-admin-2fa.dto';
import {
  AdminMessageResponseDto,
  Confirm2faResponseDto,
  Update2faResponseDto,
  UpdateAdminMeResponseDto,
} from '../dto/admin-profile-response.dto';
import { CurrentAdmin, AuthenticatedAdmin } from '../decorators/current-admin.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';

@ApiTags('Admin Auth')
@ApiBearerAuth()
@Controller('admin/me')
@UseGuards(JwtAdminGuard)
export class AdminMeController {
  constructor(
    private readonly getAdminMe: GetAdminMeUseCase,
    private readonly updateProfile: UpdateAdminProfileUseCase,
    private readonly changePassword: ChangeAdminPasswordUseCase,
    private readonly update2fa: UpdateAdmin2faUseCase,
    private readonly confirm2fa: ConfirmAdmin2faUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current admin profile + effective permissions (FR-RBAC-032)' })
  @ApiOkResponse({ type: AdminMeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Missing/invalid/expired admin token' })
  async me(@CurrentAdmin() admin: AuthenticatedAdmin): Promise<AdminMeResponseDto> {
    const view = await this.getAdminMe.execute(admin.adminId);
    return {
      id: view.id,
      full_name: view.fullName,
      email: view.email,
      phone: view.phone,
      role: view.roleName,
      is_super_admin: view.isSuperAdmin,
      two_fa_enabled: view.twofaEnabled,
      // Whether this session passed the 2FA step at login — drives the disable-flow UI
      // (contract 16 v0.2; there is no two_fa_channel — codes always go to the email).
      session_mfa_verified: admin.mfaVerified === true,
      permissions: view.permissions,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update own profile (name/phone); email is immutable (FR-RBAC-008/012)' })
  @ApiOkResponse({ type: UpdateAdminMeResponseDto })
  async updateMe(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateAdminMeDto,
    @Ip() ip: string,
  ): Promise<UpdateAdminMeResponseDto> {
    const updated = await this.updateProfile.execute({
      adminId: admin.adminId,
      fullName: dto.full_name,
      phone: dto.phone,
      ipAddress: ip,
    });
    return { id: updated.id, full_name: updated.fullName, phone: updated.phone };
  }

  @Patch('password')
  @ApiOperation({ summary: 'Change own password; revokes sessions (FR-RBAC-008)' })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  @ApiUnauthorizedResponse({ description: 'Current password incorrect' })
  @ApiBadRequestResponse({ description: 'New password fails policy' })
  async changeOwnPassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangeAdminPasswordDto,
    @Ip() ip: string,
  ): Promise<AdminMessageResponseDto> {
    await this.changePassword.execute({
      adminId: admin.adminId,
      currentPassword: dto.current_password,
      newPassword: dto.new_password,
      ipAddress: ip,
    });
    return { message: 'Password changed. Please sign in again on other devices.' };
  }

  @Patch('2fa')
  @ApiOperation({
    summary:
      'Enable (step 1: emails a code — activate via /2fa/confirm) or disable own 2FA. Email-only; opt-in for every admin incl. Super Admin (FR-RBAC-008/009)',
  })
  @ApiOkResponse({ type: Update2faResponseDto })
  @ApiUnauthorizedResponse({ description: 'Current password incorrect' })
  @ApiBadRequestResponse({
    description: 'TWOFA_NOT_ENABLED | INVALID_2FA_CODE (disable code wrong/expired)',
  })
  async updateOwn2fa(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: UpdateAdmin2faDto,
    @Ip() ip: string,
  ): Promise<Update2faResponseDto> {
    const result = await this.update2fa.execute({
      adminId: admin.adminId,
      enabled: dto.enabled,
      currentPassword: dto.current_password,
      code: dto.code,
      sessionMfaVerified: admin.mfaVerified === true,
      currentSessionId: admin.sessionId,
      ipAddress: ip,
    });
    return {
      two_fa_enabled: result.twofaEnabled,
      ...(result.verification
        ? {
            verification: {
              challenge_id: result.verification.challengeId,
              sent_to: result.verification.sentTo,
              expires_in: result.verification.expiresIn,
              resend_after: result.verification.resendAfter,
            },
          }
        : {}),
    };
  }

  @Post('2fa/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the enable code — 2FA activates only now (FR-RBAC-008)' })
  @ApiOkResponse({ type: Confirm2faResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_2FA_CODE (wrong/expired/exhausted)' })
  async confirmOwn2fa(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ConfirmAdmin2faDto,
    @Ip() ip: string,
  ): Promise<Confirm2faResponseDto> {
    const result = await this.confirm2fa.execute({
      adminId: admin.adminId,
      challengeId: dto.challenge_id,
      code: dto.code,
      currentSessionId: admin.sessionId,
      ipAddress: ip,
    });
    return { two_fa_enabled: result.twofaEnabled };
  }
}
