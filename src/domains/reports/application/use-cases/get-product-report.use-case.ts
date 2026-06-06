import { Inject, Injectable } from '@nestjs/common';

import { ReportPeriod } from '../../domain/report-period';
import { ProductMetric, ProductView } from '../../domain/report-views';
import {
  CategorySalesRow,
  IOrdersReadModel,
  ORDERS_READ_MODEL,
  ProductSalesRow,
} from '../ports/orders-read.port';
import {
  IInventoryReadModel,
  INVENTORY_READ_MODEL,
} from '../ports/inventory-read.port';
import { ReportCacheService } from '../services/report-cache.service';

/** A product/category row of the product report (FR-RPT-020/021). */
export type ProductReportRow = ProductSalesRow | CategorySalesRow;

/**
 * Product report (FR-RPT-020/021). `top_sellers` ranks products by units/revenue over paid/collected
 * order items; `by_category` rolls sales up to the product's current primary category; `slow_movers`
 * surfaces products that hold stock (INV) but sold the least in the period (ascending by units). Reads ORD
 * + INV through ports and serves from the aggregate cache. Title comes from the order snapshot (§12.10).
 */
@Injectable()
export class GetProductReportUseCase {
  constructor(
    @Inject(ORDERS_READ_MODEL) private readonly orders: IOrdersReadModel,
    @Inject(INVENTORY_READ_MODEL) private readonly inventory: IInventoryReadModel,
    private readonly cache: ReportCacheService,
  ) {}

  async execute(
    period: ReportPeriod,
    view: ProductView,
    metric: ProductMetric,
    topN: number,
  ): Promise<ProductReportRow[]> {
    const range = { from: period.from, to: period.to };
    const key = `products:${view}:${metric}:${topN}:${period.from}:${period.to}`;

    const cached = await this.cache.getOrCompute<ProductReportRow[]>(key, async () => {
      switch (view) {
        case ProductView.BY_CATEGORY:
          return this.orders.getSalesByCategory(range);
        case ProductView.SLOW_MOVERS:
          return this.slowMovers(range, topN);
        case ProductView.TOP_SELLERS:
        default:
          return this.orders.getTopProducts(range, metric, topN);
      }
    });
    return cached.value;
  }

  /** Products holding stock, ranked by fewest units sold in the period (zero-sales first). */
  private async slowMovers(
    range: { from: string; to: string },
    topN: number,
  ): Promise<ProductSalesRow[]> {
    const [withStock, salesMap] = await Promise.all([
      this.inventory.getProductsWithStock(),
      this.orders.getProductSalesMap(range),
    ]);
    const byId = new Map(salesMap.map((s) => [s.product_id, s]));
    const rows: ProductSalesRow[] = withStock.map((p) => {
      const sold = byId.get(p.product_id);
      return {
        product_id: p.product_id,
        title: sold?.title || p.title,
        units: sold?.units ?? 0,
        revenue: sold?.revenue ?? '0.00',
      };
    });
    rows.sort((a, b) => a.units - b.units || Number(a.revenue) - Number(b.revenue));
    return rows.slice(0, topN);
  }
}
