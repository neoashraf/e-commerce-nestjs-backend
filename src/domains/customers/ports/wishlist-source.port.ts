import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { WishlistService } from '../../wishlist/application/wishlist.service';

/** One wishlist item, flattened for the admin Customer 360 Wishlist panel (FR-CUST-013). */
export interface AdminWishlistItem {
  product_id: string;
  product_title: string;
  product_image: string | null;
  variant_options: Record<string, string> | null;
  /** Effective (live) price, Decimal(12,2) string, BDT. */
  price: string;
  in_stock: boolean;
  added_at: string;
}

/** Read port over WISH for a customer's wishlist (FR-CUST-013). Read-only — no writes from admin. */
export interface IWishlistSource {
  getCount(customerId: string): Promise<number>;
  /** A customer's wishlist items with live price/availability (BR-WISH-2); `[]` when none. */
  getItems(customerId: string): Promise<AdminWishlistItem[]>;
}

export const WISHLIST_SOURCE = Symbol('IWishlistSource');

/**
 * Real adapter over WISH. The count stays a single indexed `wishlist_items` query; the item list
 * reuses WISH's own `WishlistService.getWishlist` (read-only, no lazy create) so live price/on-sale/
 * availability are computed exactly as the customer-facing `GET /me/wishlist` does (BR-WISH-2) — just
 * keyed by `customerId` — then flattened to the admin shape.
 */
@Injectable()
export class WishlistSourceAdapter implements IWishlistSource {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly wishlist: WishlistService,
  ) {}

  async getCount(customerId: string): Promise<number> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT COUNT(wi.*)::int AS count
       FROM wishlists w
       LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
       WHERE w.customer_id = $1`,
      [customerId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async getItems(customerId: string): Promise<AdminWishlistItem[]> {
    const view = await this.wishlist.getWishlist(customerId);
    return view.items.map((item) => ({
      product_id: item.product.id,
      product_title: item.product.title,
      product_image: item.product.primary_image,
      variant_options: item.preferred_variant?.options ?? null,
      price: item.product.effective_price,
      in_stock: item.is_available,
      added_at: item.added_at,
    }));
  }
}
