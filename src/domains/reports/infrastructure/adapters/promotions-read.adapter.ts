import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import {
  CouponPerformanceRow,
  IPromotionsReadModel,
} from '../../application/ports/promotions-read.port';

/**
 * Read-only PROMO adapter for RPT. Aggregates the `coupon_redemptions` ledger joined to `coupons` (code)
 * and `orders` (attributed sales). Attribution (§12.9): an order's grand_total is attributed to the
 * coupon recorded on its redemption, so no order is double-counted across coupons. Only `applied`
 * (non-reversed) redemptions in the period count. Read-side only (BR-RPT-5); decoupled from PROMO ORM.
 */
@Injectable()
export class PromotionsReadAdapter implements IPromotionsReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getCouponPerformance(range: ReportRange): Promise<CouponPerformanceRow[]> {
    const rows: Array<{
      coupon_code: string;
      redemptions: number;
      discount_given: string;
      attributed_sales: string;
    }> = await this.dataSource.query(
      `SELECT c.code AS coupon_code,
              COUNT(*)::int AS redemptions,
              COALESCE(SUM(r.discount_amount), 0)::text AS discount_given,
              COALESCE(SUM(o.grand_total), 0)::text AS attributed_sales
       FROM coupon_redemptions r
       JOIN coupons c ON c.id = r.coupon_id
       LEFT JOIN orders o ON o.id = r.order_id
       WHERE r.status = 'applied'
         AND (r.created_at AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date
       GROUP BY c.code
       ORDER BY redemptions DESC`,
      [range.from, range.to],
    );
    return rows.map((r) => ({
      coupon_code: r.coupon_code,
      redemptions: Number(r.redemptions),
      discount_given: r.discount_given,
      attributed_sales: r.attributed_sales,
    }));
  }
}
