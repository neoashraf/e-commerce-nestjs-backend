import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { GetAdminMeUseCase } from '../../application/use-cases/get-admin-me.use-case';
import { AdminMeResponseDto } from '../dto/admin-me-response.dto';
import { CurrentAdmin, AuthenticatedAdmin } from '../decorators/current-admin.decorator';
import { JwtAdminGuard } from '../guards/jwt-admin.guard';

@ApiTags('Admin Auth')
@ApiBearerAuth()
@Controller('admin/me')
@UseGuards(JwtAdminGuard)
export class AdminMeController {
  constructor(private readonly getAdminMe: GetAdminMeUseCase) {}

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
      role: view.roleName,
      permissions: view.permissions,
    };
  }
}
