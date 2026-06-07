import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REPORT_TIMEZONE } from '../../domain/report-period';
import { ReportRange } from '../../application/ports/orders-read.port';
import {
  IInventoryReadModel,
  MovementSummary,
  ProductStockRow,
  StockLevelFilter,
  StockLevelRow,
} from '../../application/ports/inventory-read.port';

/**
 * Read-only INV adapter for RPT. Reads per-SKU stock from `inventory` (joined to `product_variants` /
 * `products` for SKU + title) and summarises the append-only `stock_movements` ledger for the period.
 * Stock status is derived in SQL from `available` vs `low_stock_threshold`. The movement range filter is
 * evaluated in Asia/Dhaka (BR-RPT-4). Read-side only (BR-RPT-5); decoupled from INV's ORM classes.
 */
@Injectable()
export class InventoryReadAdapter implements IInventoryReadModel {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** SQL CASE deriving the stock status from available qty and the low-stock threshold. */
  private readonly statusExpr = `CASE
      WHEN inv.available <= 0 THEN 'out_of_stock'
      WHEN inv.available <= inv.low_stock_threshold THEN 'low_stock'
      ELSE 'in_stock' END`;

  async getStockLevels(filter: StockLevelFilter): Promise<StockLevelRow[]> {
    let having = '';
    if (filter === 'low_stock') {
      having = 'WHERE inv.available > 0 AND inv.available <= inv.low_stock_threshold';
    } else if (filter === 'out_of_stock') {
      having = 'WHERE inv.available <= 0';
    }
    const rows: Array<{
      variant_id: string;
      product_id: string;
      sku_code: string;
      product_title: string;
      on_hand: number;
      reserved: number;
      available: number;
      low_stock_threshold: number;
      status: string;
    }> = await this.dataSource.query(
      `SELECT inv.variant_id AS variant_id,
              inv.product_id AS product_id,
              COALESCE(pv.sku_code, '') AS sku_code,
              COALESCE(p.name, '') AS product_title,
              inv.on_hand AS on_hand,
              inv.reserved AS reserved,
              inv.available AS available,
              inv.low_stock_threshold AS low_stock_threshold,
              ${this.statusExpr} AS status
       FROM inventory inv
       LEFT JOIN product_variants pv ON pv.id = inv.variant_id
       LEFT JOIN products p ON p.id = inv.product_id
       ${having}
       ORDER BY inv.available ASC`,
    );
    return rows.map((r) => ({
      variant_id: r.variant_id,
      product_id: r.product_id,
      sku_code: r.sku_code,
      product_title: r.product_title,
      on_hand: Number(r.on_hand),
      reserved: Number(r.reserved),
      available: Number(r.available),
      low_stock_threshold: Number(r.low_stock_threshold),
      status: r.status as StockLevelRow['status'],
    }));
  }

  async getMovementSummary(range: ReportRange): Promise<MovementSummary> {
    const [row]: Array<{
      received: number;
      sold: number;
      adjusted: number;
      restocked: number;
    }> = await this.dataSource.query(
      `SELECT
         COALESCE(SUM(quantity_delta) FILTER (WHERE type = 'receive'), 0)::int AS received,
         COALESCE(-SUM(quantity_delta) FILTER (WHERE type = 'sale'), 0)::int AS sold,
         COALESCE(SUM(quantity_delta) FILTER (WHERE type IN ('adjust', 'correction')), 0)::int AS adjusted,
         COALESCE(SUM(quantity_delta) FILTER (WHERE type = 'restock'), 0)::int AS restocked
       FROM stock_movements
       WHERE (created_at AT TIME ZONE '${REPORT_TIMEZONE}')::date BETWEEN $1::date AND $2::date`,
      [range.from, range.to],
    );
    return {
      received: Number(row?.received ?? 0),
      sold: Number(row?.sold ?? 0),
      adjusted: Number(row?.adjusted ?? 0),
      restocked: Number(row?.restocked ?? 0),
    };
  }

  async getProductsWithStock(): Promise<ProductStockRow[]> {
    const rows: Array<{ product_id: string; title: string; on_hand: number }> =
      await this.dataSource.query(
        `SELECT inv.product_id AS product_id,
                COALESCE(MAX(p.name), '') AS title,
                COALESCE(SUM(inv.on_hand), 0)::int AS on_hand
         FROM inventory inv
         LEFT JOIN products p ON p.id = inv.product_id
         GROUP BY inv.product_id
         HAVING COALESCE(SUM(inv.on_hand), 0) > 0`,
      );
    return rows.map((r) => ({
      product_id: r.product_id,
      title: r.title,
      on_hand: Number(r.on_hand),
    }));
  }
}
