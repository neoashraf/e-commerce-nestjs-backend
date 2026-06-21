import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Service health check' })
  @ApiOkResponse({ description: 'Service is up and running' })
  health(): { status: string; service: string } {
    return this.appService.health();
  }

  @Get('test')
  @ApiOperation({ summary: 'Test endpoint' })
  @ApiOkResponse({ description: "Returns today's date (ISO)" })
  test(): { data: string } {
    return { data: new Date().toISOString() };
  }
}
