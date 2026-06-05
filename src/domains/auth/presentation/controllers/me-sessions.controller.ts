import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  AuthenticatedCustomer,
  CurrentCustomer,
} from '../../../../shared/decorators/current-customer.decorator';
import { LogoutAllUseCase } from '../../application/use-cases/logout-all.use-case';
import { JwtCustomerGuard } from '../guards/jwt-customer.guard';

@ApiTags('Auth')
@ApiBearerAuth()
@UseGuards(JwtCustomerGuard)
@Controller('me/sessions')
export class MeSessionsController {
  constructor(private readonly logoutAllUseCase: LogoutAllUseCase) {}

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke all sessions for the authenticated customer' })
  async logoutAll(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<void> {
    await this.logoutAllUseCase.execute({ customerId: customer.customerId });
  }
}
