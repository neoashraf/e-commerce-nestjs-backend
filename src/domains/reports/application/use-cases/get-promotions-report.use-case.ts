import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import {
  CouponPerformanceRow,
  IPromotionsReadModel,
  PROMOTIONS_READ_MODEL,
} from '../ports/promotions-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/**
 * Promotion report (FR-RPT-051, §12.9): per-coupon redemptions, discount given, and attributed sales for
 * the period. Attribution counts orders that *used* the coupon (documented rule, no cross-coupon double
 * counting). Reads PROMO through the port and serves from the aggregate cache (BR-RPT-7).
 */
@Injectable()
export class GetPromotionsReportUseCase {
  constructor(
    @Inject(PROMOTIONS_READ_MODEL) private readonly promotions: IPromotionsReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(period: ReportPeriod): Promise<CouponPerformanceRow[]> {
    const range = { from: period.from, to: period.to };
    const cached = await this.cache.getOrCompute(`promotions:${period.from}:${period.to}`, () =>
      this.promotions.getCouponPerformance(range),
    );
    return cached.value;
  }
}
