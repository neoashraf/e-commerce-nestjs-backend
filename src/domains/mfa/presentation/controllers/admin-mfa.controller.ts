import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AuditResult } from '../../../rbac/domain/enums/audit-result.enum';
import { AuditService } from '../../../rbac/application/services/audit.service';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { GetMfaPolicyUseCase } from '../../application/use-cases/get-mfa-policy.use-case';
import { UpdateMfaPolicyUseCase } from '../../application/use-cases/update-mfa-policy.use-case';
import { UpdateMfaPolicyDto } from '../dto/admin-mfa.dto';
import { MfaPolicyResponseDto } from '../dto/mfa-response.dto';

/** Admin MFA policy management (FR-MFA-030–034). Gated by the `settings` permission. */
@ApiTags('Settings — MFA')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/settings/mfa')
export class AdminMfaController {
  constructor(
    private readonly getPolicy: GetMfaPolicyUseCase,
    private readonly updatePolicy: UpdateMfaPolicyUseCase,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Requires('settings.setting.read')
  @ApiOperation({ summary: 'Get the global MFA policy (FR-MFA-030)' })
  @ApiOkResponse({ type: MfaPolicyResponseDto })
  @ApiForbiddenResponse({ description: 'Missing settings permission' })
  async get(): Promise<MfaPolicyResponseDto> {
    return this.toResponse(await this.getPolicy.execute());
  }

  @Put()
  @Requires('settings.setting.update')
  @ApiOperation({ summary: 'Update the MFA policy — channels + enforcement (FR-MFA-030/031)' })
  @ApiOkResponse({ type: MfaPolicyResponseDto })
  @ApiBadRequestResponse({ description: 'MFA_NO_CHANNEL (mandatory with no channel enabled)' })
  @ApiForbiddenResponse({ description: 'Missing settings permission' })
  async update(
    @Body() dto: UpdateMfaPolicyDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<MfaPolicyResponseDto> {
    const updated = await this.updatePolicy.execute({
      smsEnabled: dto.sms_enabled,
      emailEnabled: dto.email_enabled,
      enforcementMode: dto.enforcement_mode,
      otpTtlSeconds: dto.otp_ttl_seconds,
      resendCooldownSeconds: dto.resend_cooldown_seconds,
      maxAttempts: dto.max_attempts,
      updatedBy: admin.adminId,
    });
    // Audit the policy change (FR-MFA-034).
    await this.audit.record({
      actorAdminId: admin.adminId,
      action: 'settings.mfa.update',
      result: AuditResult.SUCCESS,
      entityType: 'MfaSettings',
      entityId: updated.id,
      summary: {
        sms_enabled: updated.smsEnabled,
        email_enabled: updated.emailEnabled,
        enforcement_mode: updated.enforcementMode,
      },
    });
    return this.toResponse(updated);
  }

  private toResponse(s: MfaSettings): MfaPolicyResponseDto {
    return {
      sms_enabled: s.smsEnabled,
      email_enabled: s.emailEnabled,
      enforcement_mode: s.enforcementMode,
      otp_ttl_seconds: s.otpTtlSeconds,
      resend_cooldown_seconds: s.resendCooldownSeconds,
      max_attempts: s.maxAttempts,
      updated_by: s.updatedBy,
      updated_at: s.updatedAt.toISOString(),
    };
  }
}
