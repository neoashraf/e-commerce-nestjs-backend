import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AuthenticatedCustomer } from '../../shared/decorators/current-customer.decorator';
import { OptionalJwtCustomerGuard } from './guards/optional-jwt-customer.guard';
import { LeadsService, UploadedFileLike } from './leads.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';
import { SubmitLeadResultDto, UploadAttachmentResultDto } from './dto/lead-responses';

/**
 * Public lead capture (FR-LEAD-001–007; contract: Storefront — Submission). Both routes are public
 * (guest or customer); submit optionally links the authenticated customer (OptionalJwtCustomerGuard) and
 * is rate-limited (`429`) + spam-protected (honeypot/CAPTCHA in the service). The `{ data }` envelope is
 * applied globally.
 */
@ApiTags('Leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @UseGuards(OptionalJwtCustomerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a Get Help / Contact enquiry (public, rate-limited)' })
  @ApiCreatedResponse({ type: SubmitLeadResultDto })
  @ApiBadRequestResponse({ description: 'Invalid phone/message; claim_return without order_reference; spam' })
  @ApiUnprocessableEntityResponse({ description: 'Attachments present on a non-claim enquiry' })
  @ApiTooManyRequestsResponse({ description: 'Submission rate limit exceeded' })
  submit(
    @Body() dto: SubmitLeadDto,
    @Req() req: { user?: AuthenticatedCustomer },
  ): Promise<SubmitLeadResultDto> {
    return this.leads.submit(dto, req.user?.customerId ?? null);
  }

  @Post('attachments')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Upload claim evidence (image/video ≤ 10 MB) and get an attachment id' })
  @ApiCreatedResponse({ type: UploadAttachmentResultDto })
  @ApiBadRequestResponse({ description: 'Unsupported type or file too large (> 10 MB)' })
  uploadAttachment(@UploadedFile() file: UploadedFileLike): Promise<UploadAttachmentResultDto> {
    return this.leads.uploadAttachment(file);
  }
}
