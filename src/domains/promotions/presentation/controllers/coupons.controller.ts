import {
  Body,
  Controller,
  Delete,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Paginated } from '../../../../shared/dto/paginated';
import { JwtAdminGuard } from '../../../rbac/presentation/guards/jwt-admin.guard';
import { PermissionsGuard } from '../../../rbac/presentation/guards/permissions.guard';
import { Requires } from '../../../rbac/presentation/decorators/requires.decorator';
import {
  CouponDetailView,
  CouponListRow,
  CouponsService,
  RedemptionsView,
} from '../../application/services/coupons.service';
import { DEFAULT_LIMIT, MAX_LIMIT } from '../../domain/promo-constants';
import { RedemptionStatus } from '../../domain/promo-enums';
import {
  CouponCreatedDto,
  CouponDetailDto,
  CouponListRowDto,
  CreateCouponDto,
  ListCouponsDto,
  UpdateCouponDto,
} from '../dto/coupon.dto';

/**
 * Admin coupon management (FR-PROMO-001–009, 030/031; contract: Admin — Coupon Management). Gated by the
 * `promotions.coupon.*` permission family. List filters by derived status + code; create validates the
 * window/value/scope (`400`) and unique case-insensitive code (`409`); patch keeps the code immutable
 * once redeemed; delete soft-deletes (redemptions retained); usage read returns the summary + ledger.
 */
@ApiTags('Promotions — Admin Coupons')
@ApiBearerAuth()
@UseGuards(JwtAdminGuard, PermissionsGuard)
@Controller('admin/coupons')
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  @Requires('promotions.coupon.read')
  @ApiOperation({ summary: 'List coupons (filter by derived status + code; paginated)' })
  @ApiOkResponse({ type: CouponListRowDto, isArray: true })
  list(@Query() query: ListCouponsDto): Promise<Paginated<CouponListRow>> {
    return this.coupons.list({
      page: this.toInt(query.page, 1),
      limit: Math.min(this.toInt(query.limit, DEFAULT_LIMIT), MAX_LIMIT),
      status: query.status,
      q: query.q,
    });
  }

  @Get(':id')
  @Requires('promotions.coupon.read')
  @ApiOperation({ summary: 'Get a coupon by id' })
  @ApiOkResponse({ type: CouponDetailDto })
  @ApiNotFoundResponse({ description: 'COUPON_NOT_FOUND' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<CouponDetailView> {
    return this.coupons.getDetail(id);
  }

  @Post()
  @Requires('promotions.coupon.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a coupon' })
  @ApiCreatedResponse({ type: CouponCreatedDto })
  @ApiBadRequestResponse({ description: 'INVALID_WINDOW / INVALID_VALUE / INVALID_SCOPE' })
  @ApiConflictResponse({ description: 'COUPON_CODE_EXISTS' })
  async create(@Body() dto: CreateCouponDto): Promise<CouponCreatedDto> {
    const coupon = await this.coupons.create(dto);
    return { id: coupon.id, code: coupon.code };
  }

  @Patch(':id')
  @Requires('promotions.coupon.update')
  @ApiOperation({ summary: 'Update / activate / deactivate a coupon (code immutable once redeemed)' })
  @ApiBadRequestResponse({ description: 'INVALID_WINDOW / INVALID_VALUE / INVALID_SCOPE' })
  @ApiConflictResponse({ description: 'COUPON_CODE_EXISTS / CODE_IMMUTABLE' })
  @ApiOkResponse({ type: CouponDetailDto })
  @ApiNotFoundResponse({ description: 'COUPON_NOT_FOUND' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponDetailView> {
    // Same contract shape as GET — the editor re-reads the coupon from this response.
    return this.coupons.toDetailView(await this.coupons.update(id, dto));
  }

  @Delete(':id')
  @Requires('promotions.coupon.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Soft-deleted (redemptions retained)' })
  @ApiNotFoundResponse({ description: 'COUPON_NOT_FOUND' })
  @ApiOperation({ summary: 'Soft-delete a coupon' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.coupons.remove(id);
  }

  @Get(':id/redemptions')
  @Requires('promotions.coupon.read')
  @ApiOperation({ summary: 'Coupon usage summary + redemption ledger (paginated)' })
  @ApiOkResponse({ description: 'Usage summary + redemptions' })
  @ApiNotFoundResponse({ description: 'COUPON_NOT_FOUND' })
  redemptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: RedemptionStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<RedemptionsView> {
    return this.coupons.redemptionsView(id, {
      page: this.toInt(page, 1),
      limit: Math.min(this.toInt(limit, DEFAULT_LIMIT), MAX_LIMIT),
      status,
    });
  }

  private toInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 ? n : fallback;
  }
}
