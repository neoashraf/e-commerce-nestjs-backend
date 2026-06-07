import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SkipEnvelope } from '../../shared/decorators/skip-envelope.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../rbac/presentation/decorators/current-admin.decorator';
import { Requires } from '../rbac/presentation/decorators/requires.decorator';
import { JwtAdminGuard } from '../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../rbac/presentation/guards/permissions.guard';
import { CreateTemplateDto } from './dto/create-template.dto';
import { ListTemplatesQueryDto } from './dto/list-templates-query.dto';
import { PreviewTemplateDto } from './dto/preview-template.dto';
import {
  CreateTemplateResultDto,
  PreviewResultDto,
  TemplateListResponseDto,
  UpdateTemplateResultDto,
} from './dto/template-response.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

/** Admin template manager: CRUD + versioning + preview (NOTIF, SRS 09 §5.2; contract: Templates). */
@ApiTags('Notifications — Templates')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/notification-templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @Requires('notifications.template.read')
  @SkipEnvelope()
  @ApiOperation({ summary: 'List templates (filter by event_type/channel/locale/active)' })
  @ApiOkResponse({ type: TemplateListResponseDto })
  async list(@Query() query: ListTemplatesQueryDto): Promise<TemplateListResponseDto> {
    const result = await this.templates.list({
      eventType: query.event_type,
      channel: query.channel,
      locale: query.locale,
      active: query.active === undefined ? undefined : query.active === 'true',
    });
    return {
      data: result.rows.map((r) => ({
        id: r.id,
        event_type: r.eventType,
        channel: r.channel,
        locale: r.locale,
        version: r.version,
        is_active: r.isActive,
      })),
      meta: { promotional_missing_bn_sms: result.promotionalMissingBnSms },
    };
  }

  @Post()
  @Requires('notifications.template.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a template for an (event_type × channel × locale)' })
  @ApiCreatedResponse({ type: CreateTemplateResultDto })
  @ApiBadRequestResponse({ description: 'Unknown event / channel not allowed / undefined or missing placeholder' })
  @ApiConflictResponse({ description: 'An active template already exists for this triple (TEMPLATE_EXISTS)' })
  async create(
    @Body() dto: CreateTemplateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<CreateTemplateResultDto> {
    const created = await this.templates.create({
      eventType: dto.event_type,
      channel: dto.channel,
      locale: dto.locale,
      subject: dto.subject ?? null,
      body: dto.body,
      adminId: admin?.adminId ?? null,
    });
    return { id: created.id, version: created.version, is_active: created.isActive };
  }

  @Patch(':id')
  @Requires('notifications.template.update')
  @ApiOperation({ summary: 'Update a template (bumps version; keeps prior versions resolvable)' })
  @ApiOkResponse({ type: UpdateTemplateResultDto })
  @ApiBadRequestResponse({ description: 'Undefined or missing placeholder' })
  @ApiForbiddenResponse({ description: 'Template is locked (TEMPLATE_LOCKED)' })
  @ApiNotFoundResponse({ description: 'Template not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<UpdateTemplateResultDto> {
    return this.templates.update(id, {
      subject: dto.subject ?? null,
      body: dto.body,
      adminId: admin?.adminId ?? null,
    });
  }

  @Post(':id/preview')
  @Requires('notifications.template.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview a render against sample variables (encoding + sms_segments)' })
  @ApiOkResponse({ type: PreviewResultDto })
  @ApiNotFoundResponse({ description: 'Template not found' })
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewTemplateDto,
  ): Promise<PreviewResultDto> {
    const result = await this.templates.preview(id, dto.variables);
    return {
      rendered_subject: result.renderedSubject,
      rendered_body: result.renderedBody,
      encoding: result.encoding,
      sms_segments: result.smsSegments,
    };
  }
}
