import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  AuthenticatedAdmin,
  CurrentAdmin,
} from '../../../rbac/presentation/decorators/current-admin.decorator';
import { PermissionService } from '../../../rbac/application/services/permission.service';
import {
  DashboardPeriod,
  DashboardPeriodPreset,
  InvalidDashboardPeriodError,
} from '../../domain/dashboard-period';
import { DASH_PERMISSIONS } from '../../domain/widget-catalog';
import {
  ActivityType,
  DashboardService,
} from '../../application/services/dashboard.service';
import { DashboardPreferencesService } from '../../application/services/dashboard-preferences.service';
import { DataWithMeta } from '../../../../shared/dto/data-with-meta';
import { DashboardQueryDto } from '../dto/dashboard-query.dto';
import { ActivityQueryDto } from '../dto/activity-query.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';
import {
  ActivityResponseDto,
  DashboardSummaryResponseDto,
  PreferencesResponseDto,
  PreferencesUpdatedResponseDto,
  RefreshResponseDto,
} from '../dto/dashboard-response.dto';

/** Per-activity-type backing permission (FR-DASH-020/021, mirrors the recent-widget catalog). */
const ACTIVITY_PERMISSION: Record<ActivityType, string> = {
  orders: DASH_PERMISSIONS.ordersRead,
  customers: DASH_PERMISSIONS.customersRead,
  leads: DASH_PERMISSIONS.leadsRead,
};

const DEFAULT_ACTIVITY_LIMIT = 10;

/**
 * Dashboard & Overview (DASH) — read-only composition (SRS 10 §5). Every route requires an admin
 * token with `dashboard.view`; each widget's data is additionally filtered to the permissions the
 * admin holds (FR-DASH-030). KPIs/alerts/breakdowns are served from an `as_of` cache (FR-DASH-031);
 * `refresh` recomputes (FR-DASH-032). DASH owns no business data — it composes via read ports.
 */
@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly preferences: DashboardPreferencesService,
    private readonly permissions: PermissionService,
  ) {}

  @Get()
  @Requires('dashboard.view')
  @ApiOperation({ summary: 'Dashboard summary: KPIs + deltas + alerts + breakdowns + as_of' })
  @ApiOkResponse({ type: DashboardSummaryResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — invalid/oversized custom range' })
  async summary(
    @Query() query: DashboardQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<DataWithMeta<Record<string, unknown>, { visible_widgets: string[] }>> {
    const period = this.buildPeriod(query);
    const held = new Set(await this.permissions.getEffectivePermissions(admin.roleId));
    const composed = await this.dashboard.getSummary(period, held);
    return new DataWithMeta(composed.data, { visible_widgets: composed.visibleWidgets });
  }

  @Get('activity')
  @Requires('dashboard.view')
  @ApiOperation({ summary: 'Recent activity: orders / customers / leads' })
  @ApiOkResponse({ type: ActivityResponseDto })
  @ApiForbiddenResponse({ description: 'FORBIDDEN — admin lacks the permission backing this stream' })
  async activity(
    @Query() query: ActivityQueryDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<unknown[]> {
    const type = query.type as ActivityType;
    const allowed = await this.permissions.hasPermission(admin.roleId, ACTIVITY_PERMISSION[type]);
    if (!allowed) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }
    return this.dashboard.getActivity(type, query.limit ?? DEFAULT_ACTIVITY_LIMIT);
  }

  @Post('refresh')
  @Requires('dashboard.view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Force a recompute of cached aggregates for the period' })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_PERIOD — invalid/oversized custom range' })
  async refresh(@Query() query: DashboardQueryDto): Promise<{ as_of: string }> {
    const period = this.buildPeriod(query);
    return this.dashboard.refresh(period);
  }

  @Get('preferences')
  @Requires('dashboard.view')
  @ApiOperation({ summary: 'Get the per-admin dashboard layout preference' })
  @ApiOkResponse({ type: PreferencesResponseDto })
  async getPreferences(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.preferences.get(admin.adminId);
  }

  @Put('preferences')
  @Requires('dashboard.view')
  @ApiOperation({ summary: 'Update the per-admin dashboard layout preference' })
  @ApiOkResponse({ type: PreferencesUpdatedResponseDto })
  @ApiBadRequestResponse({ description: 'VALIDATION_ERROR — unknown widget key referenced' })
  async updatePreferences(
    @Body() dto: UpdatePreferencesDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<{ updated: boolean }> {
    await this.preferences.update(admin.adminId, dto);
    return { updated: true };
  }

  /** Resolve + validate the period, mapping the domain range error to `400 INVALID_PERIOD`. */
  private buildPeriod(query: DashboardQueryDto): DashboardPeriod {
    try {
      return DashboardPeriod.resolve(
        query.period ?? DashboardPeriodPreset.LAST_7D,
        query.from,
        query.to,
      );
    } catch (err) {
      if (err instanceof InvalidDashboardPeriodError) {
        throw new BadRequestException({ code: 'INVALID_PERIOD', message: err.reason });
      }
      throw err;
    }
  }
}
