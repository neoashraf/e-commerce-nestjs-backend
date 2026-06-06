import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiAcceptedResponse, ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import { InsightRow, QueryLogService } from '../../application/services/query-log.service';
import { ReindexJobService } from '../../application/services/reindex-job.service';
import { DEFAULT_LIMIT, InsightsType, MAX_LIMIT } from '../../domain/search-enums';
import { InsightRowDto, InsightsQueryDto, ReindexResponseDto } from '../dto/admin-config.dto';

/**
 * Admin index rebuild + search insights (FR-SRCH-072/014; contract: Admin — Index & Insights). Reindex
 * returns 202 with a running job while the storefront keeps serving the existing index. Insights is the
 * operational popular/zero-result view over the query log (full reporting lives in RPT).
 */
@ApiTags('Search — Admin Index')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/search')
export class AdminSearchIndexController {
  constructor(
    private readonly reindex: ReindexJobService,
    private readonly queryLog: QueryLogService,
  ) {}

  @Post('reindex')
  @Requires('search.index.rebuild')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Rebuild the search index (async; storefront stays served)' })
  @ApiAcceptedResponse({ type: ReindexResponseDto })
  rebuild(): ReindexResponseDto {
    return this.reindex.start();
  }

  @Get('insights')
  @Requires('reports.read')
  @ApiOperation({ summary: 'Popular / zero-result query insights (paginated)' })
  @ApiOkResponse({ type: InsightRowDto, isArray: true })
  insights(@Query() query: InsightsQueryDto): Promise<Paginated<InsightRow>> {
    const page = this.toInt(query.page, 1);
    const limit = Math.min(this.toInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    return this.queryLog.insights({
      type: query.type ?? InsightsType.POPULAR,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page,
      limit,
    });
  }

  private toInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : fallback;
  }
}
